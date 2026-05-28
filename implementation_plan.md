# Kế hoạch thực hiện: Tích hợp Shader mới & logic điều khiển nâng cao cho Lightroom Web

Kế hoạch này mô tả các bước chi tiết để thêm các tính năng: Clarity, Dehaze, Vignette, Grain, và Parametric Tone Curve cùng biểu đồ vẽ đường cong 2D động.

## 1. Yêu cầu chi tiết
- **Fragment Shader (fsSource):** Thêm 8 uniforms mới và thuật toán xử lý tương ứng.
- **State & Presets:** Cập nhật `sliders` và toàn bộ 7 preset mẫu để tránh lỗi thiếu thuộc tính.
- **Uniform Binding:** Cập nhật hàm `render()` và `exportImage()` để truyền các tham số này sang GPU WebGL.
- **UI Sliders:** Thêm các slider vào file `index.html` (Tone Curve và Effects).
- **Setup & Reset:** Đăng ký các slider mới vào `setupSliders()` và `resetSliders()`.
- **Tone Curve Graph:** Viết hàm `drawToneCurveGraph()` vẽ đồ thị 2D động trên canvas `curve-canvas` và liên kết với luồng cập nhật.

## 2. Các thay đổi đề xuất

### 2.1. File `index.html`
- Thêm section **Đường Cong Tone Curve (Tone Curve)** chứa canvas `curve-canvas` và 4 slider tương ứng (`curveShadows`, `curveDarks`, `curveLights`, `curveHighlights`).
- Thêm section **Hiệu Ứng (Effects)** chứa 4 slider (`clarity`, `dehaze`, `vignette`, `grain`).

### 2.2. File `style.css`
- Thêm css định dạng cho biểu đồ `curve-canvas` để nó hiển thị căn giữa, đẹp mắt, có đường viền và bo góc phù hợp với thiết kế chung.

### 2.3. File `app.js`
- **Fragment Shader (fsSource):**
  - Khai báo các uniform.
  - Viết thuật toán cho Tone Curve, Clarity, Dehaze, Vignette, Grain.
- **State & Presets:**
  - Cập nhật đối tượng `sliders`.
  - Cập nhật tất cả các preset trong `PRESETS`.
- **Hàm `render()` và `exportImage()`:**
  - Thêm `gl.uniform1f` cho 8 uniform mới.
- **Hàm `setupSliders()` và `resetSliders()`:**
  - Thêm các slider mới vào mảng id để lắng nghe sự kiện và reset trạng thái.
- **Hàm `drawToneCurveGraph()`:**
  - Viết logic vẽ đồ thị 2D trên canvas `curve-canvas`.
  - Liên kết vào `scheduleHistogramUpdate()` để vẽ tự động khi có cập nhật.

## 3. Các bước kiểm thử
1. Nạp ảnh mẫu vào ứng dụng.
2. Điều chỉnh các slider của Tone Curve và quan sát đường cong 2D cập nhật thời gian thực, đồng thời độ sáng của ảnh thay đổi tương thích.
3. Thay đổi các slider Clarity, Dehaze, Vignette, Grain để xem chất lượng hình ảnh thay đổi trên WebGL Canvas.
4. Chọn các preset khác nhau và xác nhận các slider mới cũng được đặt lại chính xác.
5. Thực hiện xuất ảnh và xác minh ảnh xuất ra áp dụng đầy đủ các bộ lọc này.
