# Cẩm nang phân tích các công cụ Develop Module của Adobe Lightroom Classic

Tài liệu này cung cấp cái nhìn chi tiết và đặc tả kỹ thuật về mọi công cụ, phân hệ điều chỉnh ảnh hậu kỳ trong phân hệ **Develop** của Adobe Lightroom Classic, nhằm phục vụ làm nền tảng đặc tả tính năng để xây dựng ứng dụng web chỉnh ảnh chuyên nghiệp.

---

## 1. Tổng quan cấu trúc Develop Module
Trong Lightroom Classic, Develop Module được tổ chức thành các panel chức năng xếp dọc từ trên xuống dưới ở cột bên phải. Mỗi panel giải quyết một nhóm nhiệm vụ chỉnh sửa ánh sáng, màu sắc hoặc chi tiết riêng biệt:

```
[Histogram] -> [Basic] -> [Tone Curve] -> [Color Mixer (HSL)] 
-> [Color Grading] -> [Detail] -> [Lens Corrections] -> [Transform] 
-> [Effects] -> [Calibration]
```

---

## 2. Chi tiết 9 Panels chỉnh sửa ảnh của Lightroom

### 📊 PANEL 1: BASIC (Bảng điều chỉnh cơ bản)
Đây là bảng quan trọng nhất, thiết lập nền tảng về ánh sáng và màu sắc tổng thể cho bức ảnh.

#### Nhóm 1: Treatment & Profile (Xử lý & Hồ sơ màu)
- **Color / B&W:** Lựa chọn ảnh màu hoặc chuyển sang ảnh đen trắng đơn sắc.
- **Profile (Hồ sơ màu):** Ánh xạ màu cơ sở từ cảm biến camera sang không gian màu mong muốn (ví dụ: Adobe Color, Adobe Portrait, Adobe Landscape). *Chú ý: Profile là lớp biến đổi đầu tiên, trước khi áp dụng các thanh trượt.*

#### Nhóm 2: White Balance (Cân bằng trắng)
- **Temp (Temperature - Nhiệt độ màu):** Dịch chuyển tông màu giữa Xanh dương (Cool - lạnh) và Vàng/Cam (Warm - ấm). Đơn vị trên ảnh RAW là Kelvin (2000K - 50000K), trên ảnh JPEG là `-100` đến `100`.
- **Tint (Sắc thái):** Bù trừ sắc độ giữa Xanh lá (Green) và Hồng tím (Magenta) để triệt tiêu các ánh màu không mong muốn.

#### Nhóm 3: Tone (Tông màu ánh sáng)
- **Exposure (Phơi sáng):** Điều chỉnh độ sáng tối tổng thể của ảnh. Đơn vị tương đương khẩu độ (f-stops).
- **Contrast (Tương phản):** Tăng hoặc giảm chênh lệch độ sáng giữa các vùng sáng và vùng tối (chủ yếu tác động vào midtones).
- **Highlights (Vùng sáng):** Tác động có chọn lọc lên các vùng sáng nhất của ảnh. Kéo âm (-) để khôi phục các chi tiết mây, bầu trời bị cháy sáng. Kéo dương (+) để làm sáng thêm.
- **Shadows (Vùng tối):** Tác động có chọn lọc lên các vùng tối của ảnh. Kéo dương (+) để mở bóng tối, khôi phục chi tiết bị khuất. Kéo âm (-) để làm sâu thêm bóng tối.
- **Whites (Điểm trắng):** Xác định ngưỡng cắt sáng (white clipping). Đặt mức sáng tối đa của ảnh.
- **Blacks (Điểm tối):** Xác định ngưỡng cắt tối (black clipping). Đặt mức tối tối đa của ảnh (chuyển các pixel tối thành đen hoàn hảo).

#### Nhóm 4: Presence (Độ hiện diện)
- **Texture (Kết cấu):** Tăng/giảm độ chi tiết nhỏ ở các cạnh biên trung bình (ví dụ: chi tiết da, tóc) mà không gây nhiễu hạt.
- **Clarity (Độ rõ nét):** Tăng tương phản vùng biên cục bộ diện rộng (local contrast). Giúp ảnh trông có chiều sâu và nổi khối hơn.
- **Dehaze (Khử mù):** Tăng/giảm độ tương phản yếu do sương mù, khói hoặc ánh sáng lóa gây ra.
- **Vibrance (Độ bão hòa thông minh):** Tăng bão hòa ưu tiên cho các pixel có màu sắc nhạt chưa bão hòa, đồng thời bảo vệ tông màu da người không bị cháy màu.
- **Saturation (Độ bão hòa toàn cục):** Tăng/giảm độ rực rỡ màu sắc đồng đều cho mọi pixel.

---

### 📈 PANEL 2: TONE CURVE (Đường cong tông màu)
Cung cấp khả năng kiểm soát độ tương phản và ánh sáng chi tiết hơn bảng Basic thông qua biểu đồ đường cong.

#### Các chế độ hoạt động:
1. **Parametric Curve (Đường cong tham số):** Đường cong được chia thành 4 vùng cố định: **Highlights**, **Lights** (Sáng nhẹ), **Darks** (Tối nhẹ), **Shadows**. Người dùng điều chỉnh bằng các thanh trượt kéo biên dưới biểu đồ.
2. **Point Curve (Đường cong điểm):** Người dùng có thể nhấp chuột để tạo các điểm neo (anchor points) bất kỳ trên đường cong để uốn lượn tùy ý.
   - **Kênh RGB:** Chỉnh tương phản sáng tối tổng thể.
   - **Kênh Red, Green, Blue riêng biệt:** Chỉnh màu nghệ thuật. Ví dụ: Nâng điểm tối của kênh Blue lên sẽ phủ màu xanh dương vào vùng Shadows (hiệu ứng tone film cổ điển).

---

### 🎨 PANEL 3: COLOR MIXER (HSL / Color)
Kiểm soát màu sắc chi tiết cho 8 kênh màu độc lập: **Red (Đỏ)**, **Orange (Cam)**, **Yellow (Vàng)**, **Green (Lục)**, **Aqua (Lam nhẹ)**, **Blue (Lam)**, **Purple (Tím)**, **Magenta (Hồng tím)**.

#### Với mỗi kênh màu, người dùng chỉnh 3 thông số:
- **Hue (Sắc độ):** Thay đổi sắc thái màu. Ví dụ: Dịch chuyển màu Green từ ngả vàng sang ngả xanh biển.
- **Saturation (Độ bão hòa):** Tăng độ rực rỡ hoặc khử màu cho từng màu riêng biệt (ví dụ: làm nhạt màu cỏ úa vàng).
- **Luminance (Độ sáng màu):** Làm sáng hoặc tối riêng màu đó (ví dụ: làm da người sáng lên bằng cách tăng Luminance kênh Orange).

---

### 🌗 PANEL 4: COLOR GRADING (Phân tách tông màu)
Thay thế tính năng Split Toning cũ, cho phép phủ màu riêng biệt vào 3 vùng độ sáng của ảnh bằng các bánh xe màu (Color Wheels):

- **Shadows (Vùng tối):** Phủ tông màu lạnh/ấm riêng cho bóng tối.
- **Midtones (Vùng trung tính):** Phủ màu cho vùng da và các chi tiết trung gian.
- **Highlights (Vùng sáng):** Phủ màu sáng nghệ thuật cho mây, bầu trời.
- **Blending & Balance:** Điều chỉnh độ mượt hòa trộn và cán cân phân bổ giữa 3 vùng.

---

### 🔍 PANEL 5: DETAIL (Chi tiết sắc nét & Khử nhiễu)
Tối ưu hóa độ chi tiết cấu trúc ảnh và xử lý nhiễu hạt khi chụp thiếu sáng.

- **Sharpening (Làm nét):**
  - **Amount:** Cường độ nét.
  - **Radius:** Độ rộng vùng biên được tăng nét.
  - **Detail:** Cường độ chi tiết nhỏ được giữ lại.
  - **Masking:** Tạo mặt nạ làm nét (Giữ phím Alt để xem mặt nạ đen trắng, giúp làm nét viền chủ thể và bỏ qua vùng da phẳng).
- **Noise Reduction (Khử nhiễu):**
  - **Luminance Noise (Nhiễu hạt):** Khử các hạt muối tiêu đen trắng do chụp ISO cao.
  - **Color Noise (Nhiễu màu):** Khử các đốm màu xanh đỏ loang lổ gây bẩn ảnh.

---

### 👓 PANEL 6: LENS CORRECTIONS (Sửa lỗi ống kính)
- **Remove Chromatic Aberration (Khử viền tím/xanh):** Triệt tiêu viền màu tương phản xuất hiện ở các biên rìa sáng tối do quang sai ống kính.
- **Enable Profile Corrections:** Tự động sửa méo góc (Distortion) và viền tối góc ảnh (Vignetting) dựa trên dữ liệu cấu hình ống kính có sẵn.

---

### 📐 PANEL 7: TRANSFORM (Biến đổi phối cảnh)
- **Upright:** Công nghệ chỉnh méo góc thẳng đứng tự động hoặc thủ công để làm thẳng các đường thẳng của kiến trúc nhà cửa bị nghiêng do góc chụp.
- **Vertical, Horizontal, Rotate, Scale, Aspect:** Các slider tinh chỉnh hình học thủ công.

---

### ✨ PANEL 8: EFFECTS (Hiệu ứng)
- **Post-Crop Vignetting (Viền tối góc):** Phủ viền đen (tập trung ánh nhìn vào tâm) hoặc viền trắng lên các góc ảnh.
- **Grain (Hạt phim giả lập):** Thêm hạt nhiễu hạt phim nghệ thuật (Amount, Size, Roughness) để tạo cảm giác ảnh chụp phim cổ điển.

---

### 🧪 PANEL 9: CALIBRATION (Hiệu chuẩn camera)
Hiệu chỉnh sự dịch chuyển màu sắc RGB cơ bản của cảm biến camera.
- Thay vì chỉnh màu pixel, Calibration thay đổi định nghĩa toán học của màu Đỏ gốc (Red Primary), Lục gốc (Green Primary), và Lam gốc (Blue Primary). 
- *Ứng dụng:* Kéo Hue của Blue Primary sang trái và Red Primary sang phải là công thức cốt lõi để tạo ra tone màu xanh ngọc - cam ấm (Teal & Orange) cực kỳ được ưa chuộng.

---

## 3. Gợi ý xây dựng các tính năng nâng cao này trên Web

Để phát triển ứng dụng web chỉnh ảnh tiệm cận năng lực của Lightroom:
1.  **Về HSL và Color Mixer:** WebGL fragment shader cần chuyển đổi RGB của pixel sang không gian màu HSL, áp dụng các hệ số tăng giảm dựa trên góc màu Hue của pixel đó, sau đó convert ngược lại RGB để xuất.
2.  **Về Tone Curve:** Sử dụng các đường cong nội suy **Spline** trong JavaScript để tính toán ánh xạ từ 256 giá trị đầu vào sang đầu ra, sau đó truyền mảng ánh xạ này dưới dạng **1D Texture (Lookup Table - LUT)** vào WebGL shader để xử lý pixel siêu nhanh.
3.  **Về Noise Reduction & Sharpening:** Sử dụng các bộ lọc tích chập chênh lệch Gauss (Difference of Gaussians) và bộ lọc song phương (Bilateral Filter) trong WebGL để vừa làm nét viền vừa làm mịn bề mặt.
