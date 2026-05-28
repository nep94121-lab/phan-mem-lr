# Thuật toán và Công thức xử lý ảnh của Adobe Lightroom trên WebGL

Tài liệu này tổng hợp chi tiết các thuật toán xử lý ảnh chuyên nghiệp giống Adobe Lightroom, được tối ưu hóa để chạy trên GPU thông qua **WebGL Shaders (GLSL)**.

---

## 1. Cơ sở lý thuyết xử lý màu sắc trên WebGL
Mỗi pixel trong WebGL được biểu diễn dưới dạng một vec4 có các giá trị R, G, B, A nằm trong khoảng từ `0.0` (tối hoàn toàn) đến `1.0` (sáng hoàn toàn).

### Linear vs sRGB Color Space (Quan trọng)
Các ảnh JPEG thông thường được lưu trữ trong không gian màu sRGB để tiết kiệm băng thông và hiển thị chuẩn trên màn hình (đã áp dụng Gamma 2.2). Để tính toán chỉnh sửa ánh sáng chính xác (đặc biệt là Exposure, Highlights, Shadows), chúng ta phải chuyển ảnh sang **Linear Color Space** trước khi tính toán, sau đó chuyển ngược lại sRGB để xuất ra màn hình.

**Chuyển đổi trong GLSL:**
```glsl
// Từ sRGB sang Linear
vec3 toLinear(vec3 srgb) {
    return pow(srgb, vec3(2.2));
}

// Từ Linear sang sRGB
vec3 toSRGB(vec3 linear) {
    return pow(linear, vec3(1.0 / 2.2));
}
```

---

## 2. Công thức cho các slider điều chỉnh cơ bản (Basic Adjustments)

### a. Exposure (Phơi sáng)
Tăng hoặc giảm độ sáng tổng thể của bức ảnh bằng cách nhân các giá trị kênh màu Linear với hệ số lũy thừa cơ số 2.
- **Dải giá trị slider:** `-5.0` đến `5.0` (tương ứng với -5 đến +5 stop khẩu độ).
- **Công thức GLSL:**
```glsl
vec3 adjustExposure(vec3 color, float exposure) {
    return color * pow(2.0, exposure);
}
```

### b. Contrast (Tương phản)
Tăng hoặc giảm khoảng cách giữa các vùng sáng và vùng tối so với một điểm xám trung tính (thường là `0.5`).
- **Dải giá trị slider:** `-1.0` đến `1.0` (hoặc `-100` đến `100`).
- **Công thức GLSL:**
```glsl
vec3 adjustContrast(vec3 color, float contrast) {
    // contrast chạy từ -1.0 (không tương phản) đến 1.0 (tương phản cực cao)
    float factor = 1.0 + contrast;
    return (color - 0.5) * factor + 0.5;
}
```

### c. Cân bằng trắng: Temperature & Tint (Nhiệt độ & Sắc thái màu)
- **Temperature (Nhiệt độ màu):** Dịch chuyển màu giữa tông xanh dương (lạnh - Cool) và tông vàng/cam (ấm - Warm).
- **Tint (Sắc thái):** Dịch chuyển màu giữa tông xanh lá (Green) và hồng/magenta (Purple).
- **Công thức GLSL đơn giản:**
```glsl
vec3 adjustWhiteBalance(vec3 color, float temp, float tint) {
    // temp: -1.0 (lạnh) đến 1.0 (ấm)
    // tint: -1.0 (xanh lá) đến 1.0 (hồng)
    color.r += temp * 0.1;
    color.b -= temp * 0.1;
    
    color.g -= tint * 0.05;
    color.r += tint * 0.025;
    color.b += tint * 0.025;
    
    return clamp(color, 0.0, 1.0);
}
```

### d. Highlights & Shadows (Vùng sáng & Vùng tối)
Tác động có chọn lọc lên các vùng sáng hoặc tối của ảnh bằng cách sử dụng **Mặt nạ độ sáng (Luminance Mask)**.
- **Tính toán Luminance:**
`float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));`
- **Highlights adjustment:**
```glsl
vec3 adjustHighlights(vec3 color, float luma, float highlights) {
    // highlights chạy từ -1.0 (tối vùng sáng) đến 1.0 (sáng vùng sáng)
    float mask = smoothstep(0.4, 0.9, luma); // Tạo mặt nạ vùng sáng
    float factor = 1.0 + highlights * 0.5 * mask;
    return color * factor;
}
```
- **Shadows adjustment:**
```glsl
vec3 adjustShadows(vec3 color, float luma, float shadows) {
    // shadows chạy từ -1.0 (tối vùng tối) đến 1.0 (sáng vùng tối)
    float mask = 1.0 - smoothstep(0.1, 0.6, luma); // Tạo mặt nạ vùng tối
    float factor = 1.0 + shadows * 0.5 * mask;
    return color * factor;
}
```

### e. Saturation (Độ bão hòa màu)
Điều chỉnh độ bão hòa màu bằng cách trộn (interpolation) giữa ảnh xám (grayscale) và ảnh gốc.
- **Công thức GLSL:**
```glsl
vec3 adjustSaturation(vec3 color, float saturation) {
    // saturation: -1.0 (ảnh đen trắng) đến 1.0 (màu sắc rực rỡ)
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 grayscale = vec3(luma);
    return mix(grayscale, color, 1.0 + saturation);
}
```

---

## 3. Cấu trúc toàn bộ WebGL Fragment Shader hoàn chỉnh (mẫu)
Đây là shader tổng hợp các slider chỉnh ảnh giống Lightroom chạy cực nhanh trên GPU:

```glsl
precision highp float;

varying vec2 v_texCoord;
uniform sampler2D u_image;

// Uniforms từ UI slider
uniform float u_exposure;     // -5.0 đến 5.0
uniform float u_contrast;     // -1.0 đến 1.0
uniform float u_temp;         // -1.0 đến 1.0
uniform float u_tint;         // -1.0 đến 1.0
uniform float u_highlights;   // -1.0 đến 1.0
uniform float u_shadows;      // -1.0 đến 1.0
uniform float u_saturation;   // -1.0 đến 1.0

// Chuyển đổi màu sắc
vec3 toLinear(vec3 srgb) {
    return pow(srgb, vec3(2.2));
}

vec3 toSRGB(vec3 linear) {
    return pow(linear, vec3(1.0 / 2.2));
}

void main() {
    // 1. Đọc màu pixel từ Texture
    vec4 texel = texture2D(u_image, v_texCoord);
    vec3 color = toLinear(texel.rgb); // Chuyển sang không gian màu tuyến tính
    
    // 2. Chỉnh White Balance (Temp & Tint)
    color.r += u_temp * 0.12;
    color.b -= u_temp * 0.12;
    color.g -= u_tint * 0.06;
    color.r += u_tint * 0.03;
    color.b += u_tint * 0.03;
    color = clamp(color, 0.0, 1.0);
    
    // 3. Chỉnh Exposure (Phơi sáng)
    color *= pow(2.0, u_exposure);
    
    // 4. Tính toán độ sáng (Luminance) để làm mặt nạ
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    
    // 5. Chỉnh Highlights (Vùng sáng)
    float hlMask = smoothstep(0.45, 0.9, luma);
    color *= (1.0 + u_highlights * 0.4 * hlMask);
    
    // 6. Chỉnh Shadows (Vùng tối)
    float shMask = 1.0 - smoothstep(0.05, 0.55, luma);
    color *= (1.0 + u_shadows * 0.4 * shMask);
    
    // 7. Chỉnh Contrast (Tương phản)
    color = (color - 0.5) * (1.0 + u_contrast) + 0.5;
    
    // 8. Chỉnh Saturation (Độ bão hòa)
    float newLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(newLuma), color, 1.0 + u_saturation);
    
    // 9. Giới hạn dải màu 0.0 -> 1.0
    color = clamp(color, 0.0, 1.0);
    
    // 10. Xuất kết quả đã chuyển về sRGB
    gl_FragColor = vec4(toSRGB(color), texel.a);
}
```

---

## 4. Cách tổ chức chương trình JavaScript để giao tiếp với WebGL

Khi người dùng kéo slider trên web, chúng ta chỉ cần cập nhật giá trị biến `uniform` trong shader mà không cần nạp lại ảnh hoặc tính toán lại toàn bộ pixel bằng CPU:

```javascript
// Cập nhật giá trị slider và render lại lập tức
function drawScene() {
    gl.useProgram(program);
    
    // Gửi thông số slider từ giao diện vào WebGL Shaders
    gl.uniform1f(u_exposureLocation, sliders.exposure);
    gl.uniform1f(u_contrastLocation, sliders.contrast);
    gl.uniform1f(u_tempLocation, sliders.temp);
    gl.uniform1f(u_tintLocation, sliders.tint);
    gl.uniform1f(u_highlightsLocation, sliders.highlights);
    gl.uniform1f(u_shadowsLocation, sliders.shadows);
    gl.uniform1f(u_saturationLocation, sliders.saturation);
    
    // Vẽ ảnh lên canvas
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
```

Hiệu năng của cách tiếp cận này là cực kỳ lớn, cho phép kéo thả siêu mượt mà không lo bị đơ màn hình giống hệt như trải nghiệm sử dụng phần mềm Adobe Lightroom Classic trên máy tính.
