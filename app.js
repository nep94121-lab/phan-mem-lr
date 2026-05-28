// LIGHTROOM WEB CLONE - CORE LOGIC & WEBGL ENGINE
// Thiết kế chuyên nghiệp bởi Antigravity

// Vertex Shader: Hỗ trợ biến đổi UV hình học (Crop, Rotate, Flip) và Split-View
const vsSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    varying vec2 v_texCoordRaw;
    uniform mat3 u_uvTransform;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        // Biến đổi toạ độ UV cho Crop/Rotate/Flip
        vec3 transformed = u_uvTransform * vec3(a_texCoord, 1.0);
        v_texCoord = transformed.xy;
        v_texCoordRaw = a_texCoord;
    }
`;

// Fragment Shader: Xử lý màu sắc, Tone Curve 1D LUT, Color Grading, Detail, Calibration và Split-View Before/After
const fsSource = `
    precision highp float;
    varying vec2 v_texCoord;
    varying vec2 v_texCoordRaw;
    uniform sampler2D u_image;
    
    // Split View Uniforms
    uniform float u_splitRatio;
    uniform float u_isSplitActive; // 1.0 = Bật, 0.0 = Tắt (sử dụng float thay cho bool để tương thích tốt nhất trên các card đồ hoạ)
    
    // Basic Panel Uniforms
    uniform float u_temp;         // -1.0 đến 1.0
    uniform float u_tint;         // -1.0 đến 1.0
    uniform float u_exposure;     // -3.0 đến 3.0
    uniform float u_contrast;     // -1.0 đến 1.0
    uniform float u_highlights;   // -1.0 đến 1.0
    uniform float u_shadows;      // -1.0 đến 1.0
    uniform float u_whites;       // -1.0 đến 1.0
    uniform float u_blacks;       // -1.0 đến 1.0
    uniform float u_vibrance;     // -1.0 đến 1.0
    uniform float u_saturation;   // -1.0 đến 1.0

    // Advanced Presence Sliders (Clarity, Dehaze, Vignette, Grain)
    uniform float u_clarity;      // -1.0 đến 1.0
    uniform float u_dehaze;       // -1.0 đến 1.0
    uniform float u_vignette;     // -1.0 đến 1.0
    uniform float u_grain;        // 0.0 đến 1.0

    // Tone Curve 1D LUT textures
    uniform sampler2D u_rgbLut;
    uniform sampler2D u_redLut;
    uniform sampler2D u_greenLut;
    uniform sampler2D u_blueLut;

    // Color Mixer HSL Uniforms
    uniform float u_hueRed; uniform float u_hueOrange; uniform float u_hueYellow; uniform float u_hueGreen;
    uniform float u_hueAqua; uniform float u_hueBlue; uniform float u_huePurple; uniform float u_hueMagenta;
    
    uniform float u_satRed; uniform float u_satOrange; uniform float u_satYellow; uniform float u_satGreen;
    uniform float u_satAqua; uniform float u_satBlue; uniform float u_satPurple; uniform float u_satMagenta;
    
    uniform float u_lumRed; uniform float u_lumOrange; uniform float u_lumYellow; uniform float u_lumGreen;
    uniform float u_lumAqua; uniform float u_lumBlue; uniform float u_lumPurple; uniform float u_lumMagenta;

    // Color Grading Uniforms
    uniform float u_cgShadowsHue; uniform float u_cgShadowsSat; uniform float u_cgShadowsLum;
    uniform float u_cgMidtonesHue; uniform float u_cgMidtonesSat; uniform float u_cgMidtonesLum;
    uniform float u_cgHighlightsHue; uniform float u_cgHighlightsSat; uniform float u_cgHighlightsLum;
    uniform float u_cgGlobalHue; uniform float u_cgGlobalSat; uniform float u_cgGlobalLum;
    uniform float u_cgBlending;   // 0.0 đến 1.0
    uniform float u_cgBalance;    // -1.0 đến 1.0

    // Detail Panel Uniforms
    uniform float u_detailSharpening; // 0.0 đến 1.0
    uniform float u_detailNoise;      // 0.0 đến 1.0

    // Camera Calibration Uniforms
    uniform float u_calShadowTint;    // -1.0 đến 1.0
    uniform float u_calRedHue; uniform float u_calRedSat;
    uniform float u_calGreenHue; uniform float u_calGreenSat;
    uniform float u_calBlueHue; uniform float u_calBlueSat;

    // Chuyển sang Linear Color Space để tính toán ánh sáng chính xác
    vec3 toLinear(vec3 srgb) {
        return pow(srgb, vec3(2.2));
    }

    // Chuyển ngược lại sRGB để xuất màn hình
    vec3 toSRGB(vec3 linear) {
        return pow(linear, vec3(1.0 / 2.2));
    }

    // Chuyển đổi RGB sang HSL
    vec3 rgb2hsl(vec3 c) {
        float maxVal = max(max(c.r, c.g), c.b);
        float minVal = min(min(c.r, c.g), c.b);
        float h = 0.0;
        float s = 0.0;
        float l = (maxVal + minVal) / 2.0;

        if (maxVal != minVal) {
            float d = maxVal - minVal;
            s = l > 0.5 ? d / (2.0 - maxVal - minVal) : d / (maxVal + minVal);
            if (maxVal == c.r) {
                h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
            } else if (maxVal == c.g) {
                h = (c.b - c.r) / d + 2.0;
            } else if (maxVal == c.b) {
                h = (c.r - c.g) / d + 4.0;
            }
            h /= 6.0;
        }
        return vec3(h, s, l);
    }

    float hue2rgb(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
        if (t < 1.0/2.0) return q;
        if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
        return p;
    }

    // Chuyển đổi HSL sang RGB
    vec3 hsl2rgb(vec3 c) {
        vec3 rgb;
        if (c.y == 0.0) {
            rgb = vec3(c.z); // grayscale
        } else {
            float q = c.z < 0.5 ? c.z * (1.0 + c.y) : c.z + c.y - c.z * c.y;
            float p = 2.0 * c.z - q;
            rgb.r = hue2rgb(p, q, c.x + 1.0/3.0);
            rgb.g = hue2rgb(p, q, c.x);
            rgb.b = hue2rgb(p, q, c.x - 1.0/3.0);
        }
        return rgb;
    }

    // Chuyển đổi Hue/Sat sang màu phủ (tint) cho Color Grading
    vec3 hueSat2rgb(float h, float s) {
        if (s == 0.0) return vec3(1.0);
        float q = 1.0;
        float p = 1.0 - s;
        vec3 rgb;
        rgb.r = hue2rgb(p, q, h + 1.0/3.0);
        rgb.g = hue2rgb(p, q, h);
        rgb.b = hue2rgb(p, q, h - 1.0/3.0);
        return rgb;
    }

    // Tính khoảng cách màu trên vòng tròn màu sắc [0.0, 1.0]
    float colorDist(float h, float target) {
        float d = abs(h - target);
        if (d > 0.5) d = 1.0 - d;
        return d;
    }

    // Hàm ngẫu nhiên tạo hạt nhiễu film
    float rand(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
        // --- CHẾ ĐỘ SPLIT-VIEW COMPARE (TRƯỚC / SAU) ---
        // Nếu bật Split view và vị trí pixel raw nằm bên trái thanh chia u_splitRatio, render ảnh gốc (nhưng vẫn xoay/crop)
        if (u_isSplitActive > 0.5 && v_texCoordRaw.x < u_splitRatio) {
            vec4 texelRaw = texture2D(u_image, v_texCoord);
            vec3 colorRaw = toLinear(texelRaw.rgb);
            gl_FragColor = vec4(toSRGB(colorRaw), texelRaw.a);
            return;
        }

        // 1. Áp dụng Khử nhiễu & Làm nét (Detail) tối giản trên ảnh gốc sRGB (Tối ưu tối đa số lần texture lookup)
        vec4 originalTexel = texture2D(u_image, v_texCoord);
        vec3 colorSample = originalTexel.rgb;
        vec3 processed = colorSample;
        
        if (u_detailNoise > 0.0 || u_detailSharpening > 0.0) {
            float stepX = 1.0 / 1024.0;
            float stepY = 1.0 / 1024.0;
            vec3 top = texture2D(u_image, v_texCoord + vec2(0.0, stepY)).rgb;
            vec3 bottom = texture2D(u_image, v_texCoord - vec2(0.0, stepY)).rgb;
            vec3 left = texture2D(u_image, v_texCoord - vec2(stepX, 0.0)).rgb;
            vec3 right = texture2D(u_image, v_texCoord + vec2(stepX, 0.0)).rgb;
            
            // Khử nhiễu mượt (blur đơn giản)
            vec3 blurred = (colorSample + top + bottom + left + right) / 5.0;
            
            // Làm nét (Sharpening Laplacian)
            vec3 laplacian = 4.0 * colorSample - top - bottom - left - right;
            vec3 sharpened = clamp(colorSample + laplacian * u_detailSharpening * 0.5, 0.0, 1.0);
            
            // Trộn các giá trị
            vec3 nrColor = mix(colorSample, blurred, u_detailNoise * 0.7);
            processed = mix(nrColor, sharpened, u_detailSharpening * 0.5);
        }

        // Chuyển sang không gian màu tuyến tính để xử lý các bước tiếp theo
        vec3 color = toLinear(processed);
        float initLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));

        // 2. Camera Calibration (Hiệu chuẩn sắc độ cảm biến)
        // Shadow Tint (Sắc thái vùng tối)
        float calShMask = 1.0 - smoothstep(0.0, 0.4, initLuma);
        color.g -= u_calShadowTint * 0.04 * calShMask;
        color.r += u_calShadowTint * 0.02 * calShMask;
        color.b += u_calShadowTint * 0.02 * calShMask;

        // Cân bằng trắng (Temp & Tint)
        color.r += u_temp * 0.15;
        color.b -= u_temp * 0.15;
        color.g -= u_tint * 0.07;
        color.r += u_tint * 0.035;
        color.b += u_tint * 0.035;
        color = clamp(color, 0.0, 1.0);

        // Shift 3 kênh màu sơ cấp
        vec3 redPrimary = vec3(1.0, 0.0, 0.0);
        if (u_calRedHue != 0.0) {
            redPrimary.g += u_calRedHue * 0.18;
            redPrimary.b -= u_calRedHue * 0.18;
        }
        if (u_calRedSat != 0.0) {
            float rLuma = dot(redPrimary, vec3(0.2126, 0.7152, 0.0722));
            redPrimary = mix(vec3(rLuma), redPrimary, 1.0 + u_calRedSat);
        }

        vec3 greenPrimary = vec3(0.0, 1.0, 0.0);
        if (u_calGreenHue != 0.0) {
            greenPrimary.r += u_calGreenHue * 0.18;
            greenPrimary.b -= u_calGreenHue * 0.18;
        }
        if (u_calGreenSat != 0.0) {
            float gLuma = dot(greenPrimary, vec3(0.2126, 0.7152, 0.0722));
            greenPrimary = mix(vec3(gLuma), greenPrimary, 1.0 + u_calGreenSat);
        }

        vec3 bluePrimary = vec3(0.0, 0.0, 1.0);
        if (u_calBlueHue != 0.0) {
            bluePrimary.r += u_calBlueHue * 0.18;
            bluePrimary.g -= u_calBlueHue * 0.18;
        }
        if (u_calBlueSat != 0.0) {
            float bLuma = dot(bluePrimary, vec3(0.2126, 0.7152, 0.0722));
            bluePrimary = mix(vec3(bLuma), bluePrimary, 1.0 + u_calBlueSat);
        }

        vec3 calColor;
        calColor.r = color.r * redPrimary.r + color.g * greenPrimary.r + color.b * bluePrimary.r;
        calColor.g = color.r * redPrimary.g + color.g * greenPrimary.g + color.b * bluePrimary.g;
        calColor.b = color.r * redPrimary.b + color.g * greenPrimary.b + color.b * bluePrimary.b;
        color = clamp(calColor, 0.0, 1.0);

        // 3. Exposure (Phơi sáng)
        color *= pow(2.0, u_exposure);

        // 4. Tone Adjustments (Highlights, Shadows, Whites, Blacks)
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

        float hlMask = smoothstep(0.4, 0.9, luma);
        color *= (1.0 + u_highlights * 0.4 * hlMask);
        
        float whiteMask = smoothstep(0.6, 1.0, luma);
        color += u_whites * 0.25 * whiteMask * color;

        float shMask = 1.0 - smoothstep(0.05, 0.55, luma);
        color *= (1.0 + u_shadows * 0.4 * shMask);
        
        float blackMask = 1.0 - smoothstep(0.0, 0.4, luma);
        color += u_blacks * 0.25 * blackMask * color;

        // 5. Contrast (Tương phản)
        color = (color - 0.5) * (1.0 + u_contrast) + 0.5;
        color = clamp(color, 0.0, 1.0);

        // 6. Clarity & Dehaze (Độ rõ nét & Khử mù)
        float postLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        if (u_clarity != 0.0) {
            float midtoneMask = smoothstep(0.1, 0.5, postLuma) * (1.0 - smoothstep(0.5, 0.9, postLuma));
            color = mix(color, (color - 0.5) * (1.0 + u_clarity * 0.35) + 0.5, midtoneMask);
        }
        if (u_dehaze != 0.0) {
            color = (color - 0.5) * (1.0 + u_dehaze * 0.2) + 0.5;
            color += u_dehaze * 0.05;
        }
        color = clamp(color, 0.0, 1.0);

        // 7. Tone Curve 1D LUT (Point Curve chuyên nghiệp cho từng kênh)
        // Tra cứu từng kênh màu qua Red, Green, Blue LUT
        vec3 curvedColor;
        curvedColor.r = texture2D(u_redLut, vec2(color.r, 0.5)).r;
        curvedColor.g = texture2D(u_greenLut, vec2(color.g, 0.5)).g;
        curvedColor.b = texture2D(u_blueLut, vec2(color.b, 0.5)).b;
        
        // Tra cứu màu tổng thể qua RGB Master LUT
        color.r = texture2D(u_rgbLut, vec2(curvedColor.r, 0.5)).r;
        color.g = texture2D(u_rgbLut, vec2(curvedColor.g, 0.5)).g;
        color.b = texture2D(u_rgbLut, vec2(curvedColor.b, 0.5)).b;
        color = clamp(color, 0.0, 1.0);

        float updatedLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));

        // 8. Color Grading (Phân Tách Tông Màu 3-Way)
        float cgLuma = updatedLuma;
        if (u_cgBalance > 0.0) {
            cgLuma = pow(cgLuma, 1.0 + u_cgBalance * 2.0);
        } else if (u_cgBalance < 0.0) {
            cgLuma = pow(cgLuma, 1.0 / (1.0 - u_cgBalance * 2.0));
        }

        float cgWSh = clamp(1.0 - smoothstep(0.0, mix(0.5, 0.9, u_cgBlending), cgLuma), 0.0, 1.0);
        float cgWHl = clamp(smoothstep(mix(0.1, 0.5, u_cgBlending), 1.0, cgLuma), 0.0, 1.0);
        float cgWMid = clamp(1.0 - cgWSh - cgWHl, 0.0, 1.0);

        vec3 tintSh = hueSat2rgb(u_cgShadowsHue, u_cgShadowsSat);
        vec3 tintMid = hueSat2rgb(u_cgMidtonesHue, u_cgMidtonesSat);
        vec3 tintHl = hueSat2rgb(u_cgHighlightsHue, u_cgHighlightsSat);
        vec3 tintGl = hueSat2rgb(u_cgGlobalHue, u_cgGlobalSat);

        color = mix(color, color * tintSh, cgWSh * u_cgShadowsSat);
        color = mix(color, color * tintMid, cgWMid * u_cgMidtonesSat);
        color = mix(color, color * tintHl, cgWHl * u_cgHighlightsSat);
        color = mix(color, color * tintGl, u_cgGlobalSat);

        color += cgWSh * u_cgShadowsLum * 0.12 * color;
        color += cgWMid * u_cgMidtonesLum * 0.12 * color;
        color += cgWHl * u_cgHighlightsLum * 0.12 * color;
        color += u_cgGlobalLum * 0.12 * color;
        color = clamp(color, 0.0, 1.0);

        float finalLumaForVib = dot(color, vec3(0.2126, 0.7152, 0.0722));

        // 9. Vibrance (Bão hòa thông minh bảo vệ màu da)
        float maxVal = max(color.r, max(color.g, color.b));
        float minVal = min(color.r, min(color.g, color.b));
        float sat = maxVal - minVal;
        if (u_vibrance != 0.0) {
            color = mix(color, vec3(finalLumaForVib), -u_vibrance * (1.0 - sat) * 0.6);
        }

        // 10. Color Mixer HSL (Bộ trộn 8 màu độc lập)
        vec3 hsl = rgb2hsl(color);
        float h = hsl.x;
        
        float dRed = colorDist(h, 0.0);
        float dOrange = colorDist(h, 0.083);
        float dYellow = colorDist(h, 0.167);
        float dGreen = colorDist(h, 0.333);
        float dAqua = colorDist(h, 0.5);
        float dBlue = colorDist(h, 0.667);
        float dPurple = colorDist(h, 0.778);
        float dMagenta = colorDist(h, 0.889);
        
        float wRed = smoothstep(0.083, 0.0, dRed);
        float wOrange = smoothstep(0.083, 0.0, dOrange);
        float wYellow = smoothstep(0.083, 0.0, dYellow);
        float wGreen = smoothstep(0.167, 0.0, dGreen);
        float wAqua = smoothstep(0.083, 0.0, dAqua);
        float wBlue = smoothstep(0.167, 0.0, dBlue);
        float wPurple = smoothstep(0.111, 0.0, dPurple);
        float wMagenta = smoothstep(0.111, 0.0, dMagenta);
        
        float deltaH = wRed * u_hueRed * 0.083
                     + wOrange * u_hueOrange * 0.083
                     + wYellow * u_hueYellow * 0.083
                     + wGreen * u_hueGreen * 0.12
                     + wAqua * u_hueAqua * 0.083
                     + wBlue * u_hueBlue * 0.083
                     + wPurple * u_huePurple * 0.083
                     + wMagenta * u_hueMagenta * 0.083;
                     
        hsl.x = fract(hsl.x + deltaH);
        
        float satFactor = wRed * u_satRed
                        + wOrange * u_satOrange
                        + wYellow * u_satYellow
                        + wGreen * u_satGreen
                        + wAqua * u_satAqua
                        + wBlue * u_satBlue
                        + wPurple * u_satPurple
                        + wMagenta * u_satMagenta;
                        
        if (satFactor > 0.0) {
            hsl.y = mix(hsl.y, 1.0, satFactor);
        } else {
            hsl.y = mix(hsl.y, 0.0, -satFactor);
        }
        
        float lumFactor = wRed * u_lumRed
                        + wOrange * u_lumOrange
                        + wYellow * u_lumYellow
                        + wGreen * u_lumGreen
                        + wAqua * u_lumAqua
                        + wBlue * u_lumBlue
                        + wPurple * u_lumPurple
                        + wMagenta * u_lumMagenta;
                        
        hsl.z = clamp(hsl.z + lumFactor * 0.35, 0.0, 1.0);
        color = hsl2rgb(hsl);

        // 11. Saturation (Bão hòa toàn cục)
        float finalLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(finalLuma), color, 1.0 + u_saturation);

        // 12. Effects: Vignette (Viền tối góc)
        if (u_vignette != 0.0) {
            vec2 uv = v_texCoord - 0.5;
            float dist = length(uv);
            float vig = smoothstep(0.4, 0.8, dist);
            if (u_vignette > 0.0) {
                color += vig * u_vignette * 0.3;
            } else {
                color *= (1.0 - vig * (-u_vignette) * 0.5);
            }
        }

        // 13. Effects: Grain (Hạt nhiễu film cổ điển)
        if (u_grain > 0.0) {
            float noise = rand(v_texCoord * 1500.0) - 0.5;
            float grainMask = 1.0 - 2.0 * abs(finalLuma - 0.5);
            color += noise * u_grain * 0.12 * clamp(grainMask, 0.2, 1.0);
        }

        color = clamp(color, 0.0, 1.0);
        gl_FragColor = vec4(toSRGB(color), texture2D(u_image, v_texCoord).a);
    }
`;

// App State
let gl, program;
let imageTexture = null;
let originalImage = null;
let currentImageWidth = 0;
let currentImageHeight = 0;
let isOriginalView = false;
let updateHistogramTimeout = null;
let currentZoom = 100;
let uploadedMimeType = "image/jpeg";

// Crop & Rotate State
let isCropActive = false;
let cropAngle = 0; // -45 đến 45 độ
let cropFlipH = 1; // 1 hoặc -1
let cropFlipV = 1; // 1 hoặc -1
let cropRotate90 = 0; // 0, 90, 180, 270
let cropRect = { x: 0, y: 0, w: 1, h: 1 }; // relative coordinates [0, 1]
let activeAspect = "free";

// Dragging crop overlay variables
let isDraggingCrop = false;
let cropDragMode = ""; // "move" or handle directional like "nw", "n", etc.
let dragStartCoords = { x: 0, y: 0 };
let dragStartRect = { x: 0, y: 0, w: 1, h: 1 };

// Split View State
let isSplitActive = false;
let splitRatio = 0.5;
let isDraggingSplit = false;

// Custom Presets Store
let customPresets = {};

// Multi-Image State
const imageList = [];
let activeImageId = null;

// Undo/Redo Stacks
const undoStack = [];
const redoStack = [];
const MAX_STACK_SIZE = 25;

// Tone Curve Point State
let activeCurveTab = "RGB"; // "RGB", "Red", "Green", "Blue"
const curvePoints = {
    RGB: [[0, 0], [1, 1]],
    Red: [[0, 0], [1, 1]],
    Green: [[0, 0], [1, 1]],
    Blue: [[0, 0], [1, 1]]
};
let selectedPointIndex = -1;
let isDraggingCurvePoint = false;

// LUT Texture pointers
const lutTextures = {
    RGB: null,
    Red: null,
    Green: null,
    Blue: null
};

// 8 HSL Color Channels
const HSL_COLORS = [
    { id: "Red", label: "Đỏ", class: "color-red" },
    { id: "Orange", label: "Cam", class: "color-orange" },
    { id: "Yellow", label: "Vàng", class: "color-yellow" },
    { id: "Green", label: "Xanh lá", class: "color-green" },
    { id: "Aqua", label: "Xanh ngọc", class: "color-aqua" },
    { id: "Blue", label: "Xanh dương", class: "color-blue" },
    { id: "Purple", label: "Tím", class: "color-purple" },
    { id: "Magenta", label: "Hồng tím", class: "color-magenta" }
];
const HSL_TABS = ["hue", "sat", "lum"];

// Color Grading Variables
const CG_SECTIONS = ["Shadows", "Midtones", "Highlights", "Global"];
const CG_PROPS = ["Hue", "Sat", "Lum"];

// sliders values store
const sliders = {
    temp: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0, saturation: 0,
    clarity: 0, dehaze: 0, vignette: 0, grain: 0,
    cgShadowsHue: 0, cgShadowsSat: 0, cgShadowsLum: 0,
    cgMidtonesHue: 0, cgMidtonesSat: 0, cgMidtonesLum: 0,
    cgHighlightsHue: 0, cgHighlightsSat: 0, cgHighlightsLum: 0,
    cgGlobalHue: 0, cgGlobalSat: 0, cgGlobalLum: 0,
    cgBlending: 0.5, cgBalance: 0,
    detailSharpening: 0, detailNoise: 0,
    calShadowTint: 0,
    calRedHue: 0, calRedSat: 0,
    calGreenHue: 0, calGreenSat: 0,
    calBlueHue: 0, calBlueSat: 0
};
// Add HSL sliders dynamically
HSL_TABS.forEach(tab => {
    HSL_COLORS.forEach(color => {
        sliders[`${tab}${color.id}`] = 0;
    });
});

// Original Presets
const PRESETS = {
    default: {
        temp: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0, saturation: 0,
        clarity: 0, dehaze: 0, vignette: 0, grain: 0,
        cgShadowsHue: 0, cgShadowsSat: 0, cgShadowsLum: 0,
        cgMidtonesHue: 0, cgMidtonesSat: 0, cgMidtonesLum: 0,
        cgHighlightsHue: 0, cgHighlightsSat: 0, cgHighlightsLum: 0,
        cgGlobalHue: 0, cgGlobalSat: 0, cgGlobalLum: 0,
        cgBlending: 0.5, cgBalance: 0,
        detailSharpening: 0, detailNoise: 0,
        calShadowTint: 0,
        calRedHue: 0, calRedSat: 0,
        calGreenHue: 0, calGreenSat: 0,
        calBlueHue: 0, calBlueSat: 0
    },
    cinematic: {
        temp: 15, tint: 5, exposure: 0.1, contrast: 20, highlights: -15, shadows: 20, whites: 5, blacks: -10, vibrance: 15, saturation: -10,
        clarity: 15, dehaze: 5, vignette: -20, grain: 15,
        cgShadowsHue: 220, cgShadowsSat: 25, cgShadowsLum: -5,
        cgMidtonesHue: 40, cgMidtonesSat: 15, cgMidtonesLum: 5,
        cgHighlightsHue: 50, cgHighlightsSat: 20, cgHighlightsLum: 0,
        cgGlobalHue: 0, cgGlobalSat: 0, cgGlobalLum: 0,
        cgBlending: 0.65, cgBalance: 10,
        detailSharpening: 35, detailNoise: 15,
        calShadowTint: 5, calRedHue: 10, calRedSat: -5, calGreenHue: -10, calGreenSat: 10, calBlueHue: -15, calBlueSat: 20
    },
    vintage: {
        temp: 20, tint: 10, exposure: 0.2, contrast: -10, highlights: -25, shadows: 35, whites: -15, blacks: 15, vibrance: 10, saturation: -20,
        clarity: -10, dehaze: -5, vignette: -35, grain: 35,
        cgShadowsHue: 45, cgShadowsSat: 30, cgShadowsLum: 10,
        cgMidtonesHue: 35, cgMidtonesSat: 10, cgMidtonesLum: 0,
        cgHighlightsHue: 210, cgHighlightsSat: 25, cgHighlightsLum: -10,
        cgGlobalHue: 30, cgGlobalSat: 10, cgGlobalLum: 5,
        cgBlending: 0.75, cgBalance: -15,
        detailSharpening: 15, detailNoise: 25,
        calShadowTint: -5, calRedHue: 15, calRedSat: -10, calGreenHue: 10, calGreenSat: -5, calBlueHue: 20, calBlueSat: -15
    },
    bw: {
        temp: 0, tint: 0, exposure: 0.1, contrast: 25, highlights: -5, shadows: -15, whites: 10, blacks: -20, vibrance: 0, saturation: -100,
        clarity: 25, dehaze: 10, vignette: -15, grain: 25,
        cgShadowsHue: 0, cgShadowsSat: 0, cgShadowsLum: -10,
        cgMidtonesHue: 0, cgMidtonesSat: 0, cgMidtonesLum: 0,
        cgHighlightsHue: 0, cgHighlightsSat: 0, cgHighlightsLum: 10,
        cgGlobalHue: 0, cgGlobalSat: 0, cgGlobalLum: 0,
        cgBlending: 0.5, cgBalance: 0,
        detailSharpening: 45, detailNoise: 10,
        calShadowTint: 0, calRedHue: 0, calRedSat: 0, calGreenHue: 0, calGreenSat: 0, calBlueHue: 0, calBlueSat: 0
    },
    "warm-sunset": {
        temp: 45, tint: 10, exposure: 0.2, contrast: 15, highlights: -10, shadows: 15, whites: 5, blacks: -5, vibrance: 20, saturation: 15,
        clarity: 10, dehaze: 0, vignette: -10, grain: 10,
        cgShadowsHue: 25, cgShadowsSat: 35, cgShadowsLum: 5,
        cgMidtonesHue: 35, cgMidtonesSat: 20, cgMidtonesLum: 5,
        cgHighlightsHue: 55, cgHighlightsSat: 30, cgHighlightsLum: 5,
        cgGlobalHue: 30, cgGlobalSat: 15, cgGlobalLum: 0,
        cgBlending: 0.7, cgBalance: 20,
        detailSharpening: 25, detailNoise: 15,
        calShadowTint: 0, calRedHue: -5, calRedSat: 15, calGreenHue: 5, calGreenSat: -5, calBlueHue: 10, calBlueSat: -10
    },
    "cool-winter": {
        temp: -35, tint: -5, exposure: 0.05, contrast: 5, highlights: 10, shadows: -5, whites: 5, blacks: 5, vibrance: 10, saturation: -5,
        clarity: 15, dehaze: 15, vignette: -10, grain: 5,
        cgShadowsHue: 215, cgShadowsSat: 30, cgShadowsLum: -5,
        cgMidtonesHue: 200, cgMidtonesSat: 10, cgMidtonesLum: 0,
        cgHighlightsHue: 230, cgHighlightsSat: 25, cgHighlightsLum: 5,
        cgGlobalHue: 220, cgGlobalSat: 10, cgGlobalLum: 0,
        cgBlending: 0.6, cgBalance: -10,
        detailSharpening: 35, detailNoise: 20,
        calShadowTint: -10, calRedHue: 10, calRedSat: -10, calGreenHue: -15, calGreenSat: 5, calBlueHue: -5, calBlueSat: 15
    },
    vibrant: {
        temp: 5, tint: 0, exposure: 0.1, contrast: 10, highlights: -10, shadows: 10, whites: 10, blacks: -10, vibrance: 35, saturation: 20,
        clarity: 20, dehaze: 5, vignette: -15, grain: 5,
        cgShadowsHue: 200, cgShadowsSat: 10, cgShadowsLum: 0,
        cgMidtonesHue: 40, cgMidtonesSat: 10, cgMidtonesLum: 5,
        cgHighlightsHue: 60, cgHighlightsSat: 15, cgHighlightsLum: 0,
        cgGlobalHue: 0, cgGlobalSat: 0, cgGlobalLum: 0,
        cgBlending: 0.5, cgBalance: 0,
        detailSharpening: 40, detailNoise: 10,
        calShadowTint: 0, calRedHue: 5, calRedSat: 10, calGreenHue: 5, calGreenSat: 10, calBlueHue: 0, calBlueSat: 10
    }
};

// DOM Elements
const canvas = document.getElementById("gl-canvas");
const uploadInput = document.getElementById("upload-input");
const uploadPlaceholder = document.getElementById("upload-placeholder");
const dropZone = document.getElementById("drop-zone");
const btnReset = document.getElementById("btn-reset");
const btnExport = document.getElementById("btn-export");
const btnBeforeAfter = document.getElementById("btn-before-after");
const btnSplitView = document.getElementById("btn-split-view");
const btnCreatePreset = document.getElementById("btn-create-preset");
const customPresetsList = document.getElementById("custom-presets-list");
const customPresetsHeader = document.getElementById("custom-presets-header");
const historyList = document.getElementById("history-list");
const filmstripList = document.getElementById("filmstrip-list");
const zoomToolbar = document.getElementById("zoom-toolbar");
const zoomSlider = document.getElementById("zoom-slider");
const zoomValue = document.getElementById("zoom-value");
const btnZoomOut = document.getElementById("btn-zoom-out");
const btnZoomIn = document.getElementById("btn-zoom-in");
const btnZoomFit = document.getElementById("btn-zoom-fit");
const canvasScroll = document.getElementById("canvas-scroll");
const canvasContainer = document.getElementById("canvas-container");
const cropOverlay = document.getElementById("crop-overlay");

// Crop UI Elements
const btnCropToggle = document.getElementById("btn-crop-toggle");
const btnCropApply = document.getElementById("btn-crop-apply");
const selectAspect = document.getElementById("select-aspect");
const sliderCropAngle = document.getElementById("slider-cropAngle");
const valCropAngle = document.getElementById("val-cropAngle");
const btnRotateLeft = document.getElementById("btn-rotate-left");
const btnRotateRight = document.getElementById("btn-rotate-right");
const btnFlipH = document.getElementById("btn-flip-h");
const btnFlipV = document.getElementById("btn-flip-v");

// History UI Elements (Undo, Redo, Reset)
const btnActionUndo = document.getElementById("btn-action-undo");
const btnActionRedo = document.getElementById("btn-action-redo");
const btnActionReset = document.getElementById("btn-action-reset");

// Initialize application
function init() {
    initColorMixerSliders();
    initColorGradingTabs();
    initCurveTabs();
    setupSliders();
    setupCropEvents();
    setupEventListeners();
    initWebGL();
    loadCustomPresets();
    resetSliders();
    
    // Add split drag bar in DOM
    const splitBar = document.createElement("div");
    splitBar.id = "split-drag-bar";
    splitBar.className = "split-drag-bar";
    splitBar.style.display = "none";
    
    const splitHandle = document.createElement("div");
    splitHandle.className = "split-drag-handle";
    splitHandle.innerHTML = "◀|▶";
    splitBar.appendChild(splitHandle);
    canvasContainer.appendChild(splitBar);
    
    setupSplitEvents(splitBar);
    setupHistogramEvents();
    initMobileNavigation();
}

// Mobile responsive tab bar and touch events logic
function initMobileNavigation() {
    const mobileBtns = document.querySelectorAll(".mobile-nav-btn");
    if (mobileBtns.length === 0) return;
    
    mobileBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            const targetBtn = e.currentTarget;
            mobileBtns.forEach(b => b.classList.remove("active"));
            targetBtn.classList.add("active");
            
            const tabName = targetBtn.dataset.tab;
            
            // Xoá tất cả class mobile-show cũ trên body
            document.body.classList.remove("mobile-show-canvas", "mobile-show-presets", "mobile-show-sliders", "mobile-show-history");
            
            // Thêm class tương ứng
            document.body.classList.add(`mobile-show-${tabName}`);
            
            // Gọi resize/fit canvas khi chuyển tab để ảnh luôn khít vùng hiển thị
            setTimeout(() => {
                if (originalImage) {
                    zoomFit();
                }
            }, 150);
        });
    });
    
    // Mặc định thêm class canvas cho body
    document.body.classList.add("mobile-show-canvas");
    
    // Bổ sung touch events cho nút xem ảnh gốc
    if (btnBeforeAfter) {
        btnBeforeAfter.addEventListener("touchstart", (e) => {
            e.preventDefault();
            isOriginalView = true;
            render();
        }, { passive: false });
        btnBeforeAfter.addEventListener("touchend", () => {
            isOriginalView = false;
            render();
        });
    }
    
    // Bổ sung touch events cho canvas để ấn giữ xem ảnh gốc
    if (canvas) {
        canvas.addEventListener("touchstart", (e) => {
            if (e.touches.length === 1 && !isCropActive && !isDraggingSplit) {
                isOriginalView = true;
                render();
            }
        }, { passive: true });
        
        canvas.addEventListener("touchend", () => {
            if (isOriginalView) {
                isOriginalView = false;
                render();
            }
        });
    }
}

// WebGL Initialization
function initWebGL() {
    gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
    if (!gl) {
        alert("Trình duyệt không hỗ trợ WebGL!");
        return;
    }

    const vs = compileShader(gl, vsSource, gl.VERTEX_SHADER);
    const fs = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
    
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Lỗi liên kết chương trình WebGL:", gl.getProgramInfoLog(program));
        return;
    }

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0.0, 1.0,
        1.0, 1.0,
        0.0, 0.0,
        0.0, 0.0,
        1.0, 1.0,
        1.0, 0.0,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Initialize 4 LUT textures
    ["RGB", "Red", "Green", "Blue"].forEach(channel => {
        lutTextures[channel] = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, lutTextures[channel]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    });
    
    updateLutTextures();
}

function compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Lỗi biên dịch Shader:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

// ----------------- TONE CURVE CUBIC SPLINE ALGORITHM -----------------

// Natural Cubic Spline Solver
function getNaturalKs(xs, ys) {
    const n = xs.length;
    const ks = new Float64Array(n);
    const A = Array.from({ length: n }, () => new Float64Array(n + 1));

    for (let i = 1; i < n - 1; i++) {
        A[i][i - 1] = 1 / (xs[i] - xs[i - 1]);
        A[i][i] = 2 * (1 / (xs[i] - xs[i - 1]) + 1 / (xs[i + 1] - xs[i]));
        A[i][i + 1] = 1 / (xs[i + 1] - xs[i]);
        A[i][n] = 3 * ((ys[i] - ys[i - 1]) / Math.pow(xs[i] - xs[i - 1], 2) + 
                       (ys[i + 1] - ys[i]) / Math.pow(xs[i + 1] - xs[i], 2));
    }

    A[0][0] = 2 / (xs[1] - xs[0]);
    A[0][1] = 1 / (xs[1] - xs[0]);
    A[0][n] = 3 * (ys[1] - ys[0]) / Math.pow(xs[1] - xs[0], 2);

    A[n - 1][n - 2] = 1 / (xs[n - 1] - xs[n - 2]);
    A[n - 1][n - 1] = 2 / (xs[n - 1] - xs[n - 2]);
    A[n - 1][n] = 3 * (ys[n - 1] - ys[n - 2]) / Math.pow(xs[n - 1] - xs[n - 2], 2);

    // Solve system of equations
    for (let i = 0; i < n; i++) {
        let max = i;
        for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[max][i])) max = k;
        [A[i], A[max]] = [A[max], A[i]];
        const div = A[i][i];
        for (let j = i; j <= n; j++) A[i][j] /= div;
        for (let k = 0; k < n; k++) {
            if (k !== i) {
                const factor = A[k][i];
                for (let j = i; j <= n; j++) A[k][j] -= factor * A[i][j];
            }
        }
    }
    return A.map(row => row[n]);
}

function evalSpline(x, xs, ys, ks) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    
    let i = 1;
    while (xs[i] < x) i++;
    
    const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    const a = ks[i - 1] * (xs[i] - xs[i - 1]) - (ys[i] - ys[i - 1]);
    const b = -ks[i] * (xs[i] - xs[i - 1]) + (ys[i] - ys[i - 1]);
    
    return (1 - t) * ys[i - 1] + t * ys[i] + t * (1 - t) * (a * (1 - t) + b * t);
}

// Generate 256 LUT values for GPU Tone Curve
function generateLutData(points) {
    const data = new Uint8Array(256 * 4); // RGBA texture
    const sortedPoints = [...points].sort((a, b) => a[0] - b[0]);
    
    const xs = sortedPoints.map(p => p[0]);
    const ys = sortedPoints.map(p => p[1]);
    const ks = getNaturalKs(xs, ys);

    for (let i = 0; i < 256; i++) {
        const x = i / 255.0;
        let y = evalSpline(x, xs, ys, ks);
        y = Math.max(0, Math.min(1.0, y)); // clamp [0, 1]
        
        const val = Math.round(y * 255);
        data[i * 4 + 0] = val; // R
        data[i * 4 + 1] = val; // G
        data[i * 4 + 2] = val; // B
        data[i * 4 + 3] = 255; // A
    }
    return data;
}

// Upload current curves to GPU textures
function updateLutTextures() {
    if (!gl) return;
    ["RGB", "Red", "Green", "Blue"].forEach(channel => {
        const lutData = generateLutData(curvePoints[channel]);
        gl.bindTexture(gl.TEXTURE_2D, lutTextures[channel]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutData);
    });
}

// Draw Tone Curve UI and handle interaction
function drawToneCurveCanvas() {
    const canvas = document.getElementById("curve-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    // Grid
    ctx.strokeStyle = "rgba(43, 49, 62, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, 0);
    ctx.stroke();
    
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
        const pos = (i / 4) * w;
        ctx.moveTo(pos, 0); ctx.lineTo(pos, h);
        ctx.moveTo(0, pos); ctx.lineTo(w, pos);
    }
    ctx.stroke();
    
    // Draw spline curve
    const points = curvePoints[activeCurveTab];
    const sorted = [...points].sort((a, b) => a[0] - b[0]);
    const xs = sorted.map(p => p[0]);
    const ys = sorted.map(p => p[1]);
    const ks = getNaturalKs(xs, ys);
    
    // Color of curve based on active tab
    const colors = { RGB: "#ffffff", Red: "#ff453a", Green: "#30d158", Blue: "#0a84ff" };
    ctx.strokeStyle = colors[activeCurveTab];
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let x = 0; x <= w; x++) {
        const t = x / w;
        const yVal = evalSpline(t, xs, ys, ks);
        const y = h - (yVal * h);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Draw control points
    points.forEach((p, idx) => {
        ctx.fillStyle = idx === selectedPointIndex ? "#ff9f0a" : colors[activeCurveTab];
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p[0] * w, h - (p[1] * h), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
}

function initCurveTabs() {
    document.querySelectorAll(".curve-tabs .mixer-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".curve-tabs .mixer-tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            activeCurveTab = e.target.dataset.curvetab;
            selectedPointIndex = -1;
            drawToneCurveCanvas();
        });
    });

    const curveCanvas = document.getElementById("curve-canvas");
    if (!curveCanvas) return;

    // Canvas coordinate translation helper
    function getMousePos(e) {
        const rect = curveCanvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: 1.0 - (e.clientY - rect.top) / rect.height
        };
    }

    curveCanvas.addEventListener("mousedown", (e) => {
        const pos = getMousePos(e);
        const points = curvePoints[activeCurveTab];
        
        // Check if clicked close to an existing point
        let foundIdx = -1;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const dist = Math.hypot(p[0] - pos.x, p[1] - pos.y);
            if (dist < 0.05) {
                foundIdx = i;
                break;
            }
        }

        if (foundIdx !== -1) {
            selectedPointIndex = foundIdx;
            isDraggingCurvePoint = true;
        } else {
            // Add a new point
            if (pos.x > 0.02 && pos.x < 0.98) {
                points.push([pos.x, pos.y]);
                points.sort((a, b) => a[0] - b[0]);
                selectedPointIndex = points.findIndex(p => p[0] === pos.x && p[1] === pos.y);
                isDraggingCurvePoint = true;
                saveUndoState();
            }
        }
        drawToneCurveCanvas();
    });

    curveCanvas.addEventListener("mousemove", (e) => {
        const pos = getMousePos(e);
        const points = curvePoints[activeCurveTab];

        // Update cursor visual if hover near points
        let nearPoint = false;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (Math.hypot(p[0] - pos.x, p[1] - pos.y) < 0.05) {
                nearPoint = true;
                break;
            }
        }
        curveCanvas.style.cursor = nearPoint ? "pointer" : "default";

        if (isDraggingCurvePoint && selectedPointIndex !== -1) {
            const p = points[selectedPointIndex];
            
            // X constraints (cannot drag beyond neighboring points)
            if (selectedPointIndex === 0) {
                p[0] = 0.0; // lock end points to X boundary
            } else if (selectedPointIndex === points.length - 1) {
                p[0] = 1.0;
            } else {
                const prev = points[selectedPointIndex - 1][0];
                const next = points[selectedPointIndex + 1][0];
                p[0] = Math.max(prev + 0.01, Math.min(next - 0.01, pos.x));
            }
            
            p[1] = Math.max(0.0, Math.min(1.0, pos.y));
            
            drawToneCurveCanvas();
            updateLutTextures();
            render();
            scheduleHistogramUpdate();
        }
    });

    curveCanvas.addEventListener("mouseup", () => {
        if (isDraggingCurvePoint) {
            isDraggingCurvePoint = false;
            addHistoryStep(`Chỉnh Curve ${activeCurveTab} (Số điểm: ${curvePoints[activeCurveTab].length})`);
        }
    });

    // Double click to remove middle points
    curveCanvas.addEventListener("dblclick", (e) => {
        const pos = getMousePos(e);
        const points = curvePoints[activeCurveTab];
        
        let foundIdx = -1;
        for (let i = 1; i < points.length - 1; i++) { // exclude endpoints
            const p = points[i];
            if (Math.hypot(p[0] - pos.x, p[1] - pos.y) < 0.05) {
                foundIdx = i;
                break;
            }
        }

        if (foundIdx !== -1) {
            saveUndoState();
            points.splice(foundIdx, 1);
            selectedPointIndex = -1;
            drawToneCurveCanvas();
            updateLutTextures();
            render();
            scheduleHistogramUpdate();
            addHistoryStep(`Xoá điểm Curve ${activeCurveTab}`);
        }
    });
}


// ----------------- CROP & ROTATE GEOMETRY ALGORITHM -----------------

// Calculate 3x3 transformation matrix for WebGL Texture Coordinates
function getUVTransformMatrix() {
    // Identity Matrix
    let mat = [
        1, 0, 0,
        0, 1, 0,
        0, 0, 1
    ];
    
    function multiply(m1, m2) {
        let r = new Float32Array(9);
        r[0] = m1[0]*m2[0] + m1[1]*m2[3] + m1[2]*m2[6];
        r[1] = m1[0]*m2[1] + m1[1]*m2[4] + m1[2]*m2[7];
        r[2] = m1[0]*m2[2] + m1[1]*m2[5] + m1[2]*m2[8];
        r[3] = m1[3]*m2[0] + m1[4]*m2[3] + m1[5]*m2[6];
        r[4] = m1[3]*m2[1] + m1[4]*m2[4] + m1[5]*m2[7];
        r[5] = m1[3]*m2[2] + m1[4]*m2[5] + m1[5]*m2[8];
        r[6] = m1[6]*m2[0] + m1[7]*m2[3] + m1[8]*m2[6];
        r[7] = m1[6]*m2[1] + m1[7]*m2[4] + m1[8]*m2[7];
        r[8] = m1[6]*m2[2] + m1[7]*m2[5] + m1[8]*m2[8];
        return r;
    }
    
    function translate(tx, ty) {
        let t = [
            1, 0, 0,
            0, 1, 0,
            tx, ty, 1
        ];
        mat = multiply(mat, t);
    }
    
    function rotate(angleRad) {
        let c = Math.cos(angleRad);
        let s = Math.sin(angleRad);
        let r = [
            c, s, 0,
            -s, c, 0,
            0, 0, 1
        ];
        mat = multiply(mat, r);
    }
    
    function scale(sx, sy) {
        let s = [
            sx, 0, 0,
            0, sy, 0,
            0, 0, 1
        ];
        mat = multiply(mat, s);
    }
    
    // Coordinate conversion mapping
    // Step 1: Center coordinate around (0, 0)
    translate(-0.5, -0.5);
    
    // Step 2: Apply Flips
    scale(cropFlipH, cropFlipV);
    
    // Step 3: Apply 90-degree rotations
    if (cropRotate90 !== 0) {
        rotate(cropRotate90 * Math.PI / 180);
    }
    
    // Step 4: Apply Free rotation angle
    if (cropAngle !== 0) {
        rotate(cropAngle * Math.PI / 180);
    }
    
    // Step 5: Crop Scale & Offset (Only zoom in if we are NOT currently dragging overlay interactively)
    if (!isCropActive) {
        let cropCenterX = cropRect.x + cropRect.w / 2 - 0.5;
        let cropCenterY = cropRect.y + cropRect.h / 2 - 0.5;
        translate(cropCenterX, cropCenterY);
        scale(cropRect.w, cropRect.h);
    }
    
    // Step 6: Move back to original space
    translate(0.5, 0.5);
    
    return mat;
}

// Setup Drag & Crop Overlay Interactions
function setupCropEvents() {
    // Aspect ratios dropdown mapping
    selectAspect.addEventListener("change", (e) => {
        activeAspect = e.target.value;
        adjustCropOverlayToAspect();
    });

    sliderCropAngle.addEventListener("input", (e) => {
        cropAngle = parseInt(e.target.value);
        valCropAngle.textContent = (cropAngle >= 0 ? "+" : "") + cropAngle + "°";
        render();
    });
    
    sliderCropAngle.addEventListener("change", () => {
        addHistoryStep(`Xoay tự do: ${cropAngle}°`);
    });

    btnRotateLeft.addEventListener("click", () => {
        saveUndoState();
        cropRotate90 = (cropRotate90 - 90 + 360) % 360;
        render();
        updateCropOverlayPosition();
        addHistoryStep("Xoay Trái 90°");
    });

    btnRotateRight.addEventListener("click", () => {
        saveUndoState();
        cropRotate90 = (cropRotate90 + 90) % 360;
        render();
        updateCropOverlayPosition();
        addHistoryStep("Xoay Phải 90°");
    });

    btnFlipH.addEventListener("click", () => {
        saveUndoState();
        cropFlipH *= -1;
        render();
        addHistoryStep("Lật Ngang");
    });

    btnFlipV.addEventListener("click", () => {
        saveUndoState();
        cropFlipV *= -1;
        render();
        addHistoryStep("Lật Dọc");
    });

    btnCropToggle.addEventListener("click", () => {
        if (!originalImage) return;
        saveUndoState();
        isCropActive = !isCropActive;
        
        if (isCropActive) {
            btnCropToggle.textContent = "Hủy Bỏ Cắt";
            btnCropApply.style.display = "inline-flex";
            cropOverlay.style.display = "block";
            
            // Reset temporary crop rectangles to current active cropRect
            updateCropOverlayPosition();
        } else {
            deactivateCropUI();
        }
        render();
    });

    btnCropApply.addEventListener("click", () => {
        saveUndoState();
        applyCropSelection();
        deactivateCropUI();
        render();
        scheduleHistogramUpdate();
        addHistoryStep("Xác nhận cắt ảnh");
    });

    // Mouse drag crop interactions
    cropOverlay.addEventListener("mousedown", (e) => {
        if (!isCropActive) return;
        
        const rect = cropOverlay.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const border = 15; // margin of hover detection
        
        dragStartCoords = { x: e.clientX, y: e.clientY };
        dragStartRect = { ...cropRect };
        isDraggingCrop = true;
        
        // Detect handles or body move
        if (mx < border && my < border) cropDragMode = "nw";
        else if (mx > rect.width - border && my < border) cropDragMode = "ne";
        else if (mx < border && my > rect.height - border) cropDragMode = "sw";
        else if (mx > rect.width - border && my > rect.height - border) cropDragMode = "se";
        else if (my < border) cropDragMode = "n";
        else if (my > rect.height - border) cropDragMode = "s";
        else if (mx < border) cropDragMode = "w";
        else if (mx > rect.width - border) cropDragMode = "e";
        else cropDragMode = "move";
        
        e.stopPropagation();
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDraggingCrop || !isCropActive) return;
        
        const canvasRect = canvas.getBoundingClientRect();
        const dx = (e.clientX - dragStartCoords.x) / canvasRect.width;
        const dy = (e.clientY - dragStartCoords.y) / canvasRect.height;
        
        const newRect = { ...dragStartRect };
        
        if (cropDragMode === "move") {
            newRect.x = Math.max(0, Math.min(1.0 - newRect.w, dragStartRect.x + dx));
            newRect.y = Math.max(0, Math.min(1.0 - newRect.h, dragStartRect.y + dy));
        } else {
            // Handle drags stretching boundaries
            if (cropDragMode.includes("w")) {
                const limitX = dragStartRect.x + dragStartRect.w;
                newRect.x = Math.max(0, Math.min(limitX - 0.1, dragStartRect.x + dx));
                newRect.w = limitX - newRect.x;
            }
            if (cropDragMode.includes("e")) {
                newRect.w = Math.max(0.1, Math.min(1.0 - dragStartRect.x, dragStartRect.w + dx));
            }
            if (cropDragMode.includes("n")) {
                const limitY = dragStartRect.y + dragStartRect.h;
                newRect.y = Math.max(0, Math.min(limitY - 0.1, dragStartRect.y + dy));
                newRect.h = limitY - newRect.y;
            }
            if (cropDragMode.includes("s")) {
                newRect.h = Math.max(0.1, Math.min(1.0 - dragStartRect.y, dragStartRect.h + dy));
            }
            
            // Constrain aspect ratio if locked
            applyAspectConstraints(newRect);
        }
        
        cropRect = newRect;
        drawCropOverlayFromRect();
    });

    window.addEventListener("mouseup", () => {
        isDraggingCrop = false;
    });
}

function deactivateCropUI() {
    isCropActive = false;
    btnCropToggle.textContent = "Bật Khung Cắt";
    btnCropApply.style.display = "none";
    cropOverlay.style.display = "none";
}

function updateCropOverlayPosition() {
    drawCropOverlayFromRect();
}

function drawCropOverlayFromRect() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    
    cropOverlay.style.left = `${cropRect.x * w}px`;
    cropOverlay.style.top = `${cropRect.y * h}px`;
    cropOverlay.style.width = `${cropRect.w * w}px`;
    cropOverlay.style.height = `${cropRect.h * h}px`;
}

function applyCropSelection() {
    // Commit the temporary crop values
    // cropRect values are saved for rendering zoom matrix
}

function adjustCropOverlayToAspect() {
    if (activeAspect === "free") return;
    
    let ratio = 1.0;
    if (activeAspect === "original") {
        ratio = currentImageWidth / currentImageHeight;
    } else {
        const parts = activeAspect.split(":");
        ratio = parseInt(parts[0]) / parseInt(parts[1]);
    }
    
    // Scale current cropRect to fit ratio
    const currentRatio = cropRect.w / cropRect.h;
    if (currentRatio > ratio) {
        // Shrink width
        cropRect.w = cropRect.h * ratio;
    } else {
        // Shrink height
        cropRect.h = cropRect.w / ratio;
    }
    
    // Keep within bounds [0, 1]
    if (cropRect.x + cropRect.w > 1.0) cropRect.x = 1.0 - cropRect.w;
    if (cropRect.y + cropRect.h > 1.0) cropRect.y = 1.0 - cropRect.h;
    
    drawCropOverlayFromRect();
}

function applyAspectConstraints(rect) {
    if (activeAspect === "free") return;
    
    let ratio = 1.0;
    if (activeAspect === "original") {
        ratio = currentImageWidth / currentImageHeight;
    } else {
        const parts = activeAspect.split(":");
        ratio = parseInt(parts[0]) / parseInt(parts[1]);
    }
    
    // Adjust height based on width expansion
    rect.h = rect.w / ratio;
    
    // If it violates image boundary scale down both
    if (rect.y + rect.h > 1.0) {
        rect.h = 1.0 - rect.y;
        rect.w = rect.h * ratio;
    }
}


// ----------------- INTERACTIVE HISTOGRAM ACTIONS -----------------

function setupHistogramEvents() {
    const histCanvas = document.getElementById("histogram-canvas");
    if (!histCanvas) return;
    
    let isDraggingHistogram = false;
    let dragRegion = "";
    let dragStartX = 0;
    let dragStartValue = 0;
    
    function getRegion(e) {
        const rect = histCanvas.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * histCanvas.width;
        
        if (mx < 38) return "blacks";
        if (mx < 102) return "shadows";
        if (mx < 179) return "exposure";
        if (mx < 230) return "highlights";
        return "whites";
    }
    
    histCanvas.addEventListener("mousemove", (e) => {
        if (isDraggingHistogram) return;
        const region = getRegion(e);
        histCanvas.title = `${region.toUpperCase()} - Nhấp kéo trái/phải để chỉnh`;
    });
    
    histCanvas.addEventListener("mousedown", (e) => {
        if (!originalImage) return;
        saveUndoState();
        isDraggingHistogram = true;
        dragRegion = getRegion(e);
        dragStartX = e.clientX;
        
        if (dragRegion === "exposure") {
            dragStartValue = sliders.exposure;
        } else {
            dragStartValue = sliders[dragRegion];
        }
        
        e.preventDefault();
    });
    
    window.addEventListener("mousemove", (e) => {
        if (!isDraggingHistogram) return;
        
        const deltaX = e.clientX - dragStartX;
        
        if (dragRegion === "exposure") {
            const deltaVal = deltaX * 0.015; // sensitivity exposure
            sliders.exposure = Math.max(-3.0, Math.min(3.0, dragStartValue + deltaVal));
            document.getElementById("slider-exposure").value = sliders.exposure * 100;
            document.getElementById("val-exposure").textContent = (sliders.exposure >= 0 ? "+" : "") + sliders.exposure.toFixed(2);
        } else {
            const deltaVal = deltaX * 0.01; // sensitivity other regions
            sliders[dragRegion] = Math.max(-1.0, Math.min(1.0, dragStartValue + deltaVal));
            document.getElementById(`slider-${dragRegion}`).value = sliders[dragRegion] * 100;
            document.getElementById(`val-${dragRegion}`).textContent = (sliders[dragRegion] >= 0 ? "+" : "") + Math.round(sliders[dragRegion] * 100);
        }
        
        render();
        scheduleHistogramUpdate();
    });
    
    window.addEventListener("mouseup", () => {
        if (isDraggingHistogram) {
            isDraggingHistogram = false;
            addHistoryStep(`Kéo Histogram (${dragRegion.toUpperCase()})`);
        }
    });
}


// ----------------- SPLIT-SCREEN COMPARISON LOGIC -----------------

function setupSplitEvents(splitBar) {
    btnSplitView.addEventListener("click", () => {
        if (!originalImage) return;
        isSplitActive = !isSplitActive;
        
        if (isSplitActive) {
            btnSplitView.classList.add("active");
            btnSplitView.textContent = "Chế độ: Đơn";
            splitBar.style.display = "block";
            positionSplitBar();
        } else {
            btnSplitView.classList.remove("active");
            btnSplitView.textContent = "Split View";
            splitBar.style.display = "none";
        }
        render();
    });
    
    function positionSplitBar() {
        const rect = canvas.getBoundingClientRect();
        const scrollRect = canvasScroll.getBoundingClientRect();
        
        // Relative coordinates to canvas container
        const left = canvas.offsetLeft + (rect.width * splitRatio);
        splitBar.style.left = `${left}px`;
        splitBar.style.top = `${canvas.offsetTop}px`;
        splitBar.style.height = `${rect.height}px`;
    }
    
    window.addEventListener("resize", () => {
        if (isSplitActive) positionSplitBar();
    });
    
    // Zoom/Fit alters position too
    const observer = new MutationObserver(() => {
        if (isSplitActive) positionSplitBar();
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ["style"] });
    
    splitBar.addEventListener("mousedown", (e) => {
        isDraggingSplit = true;
        e.preventDefault();
        e.stopPropagation();
    });
    
    window.addEventListener("mousemove", (e) => {
        if (!isDraggingSplit) return;
        
        const rect = canvas.getBoundingClientRect();
        let newX = e.clientX - rect.left;
        newX = Math.max(0, Math.min(rect.width, newX));
        
        splitRatio = newX / rect.width;
        positionSplitBar();
        render();
    });
    
    window.addEventListener("mouseup", () => {
        isDraggingSplit = false;
    });
}


// ----------------- FILMSTRIP MULTI-IMAGE MANAGEMENT -----------------

function updateFilmstripUI() {
    filmstripList.innerHTML = "";
    
    imageList.forEach((imgObj) => {
        const item = document.createElement("div");
        item.className = "filmstrip-item" + (imgObj.id === activeImageId ? " active" : "");
        item.dataset.id = imgObj.id;
        
        const img = document.createElement("img");
        img.src = imgObj.dataUrl;
        item.appendChild(img);
        
        const title = document.createElement("div");
        title.className = "filmstrip-item-title";
        title.textContent = imgObj.name;
        item.appendChild(title);
        
        // Click to load image
        item.addEventListener("click", () => {
            switchActiveImage(imgObj.id);
        });
        
        filmstripList.appendChild(item);
    });
}

function switchActiveImage(id) {
    if (activeImageId === id) return;
    
    // 1. Save current active image settings
    const currentImg = imageList.find(img => img.id === activeImageId);
    if (currentImg) {
        currentImg.slidersState = { ...sliders };
        // Save curves state deeply
        currentImg.curvesState = JSON.parse(JSON.stringify(curvePoints));
        currentImg.cropState = {
            cropAngle, cropFlipH, cropFlipV, cropRotate90,
            cropRect: { ...cropRect }
        };
    }
    
    // 2. Load next active image settings
    const newImg = imageList.find(img => img.id === id);
    if (!newImg) return;
    
    activeImageId = id;
    originalImage = newImg.originalImage;
    uploadedMimeType = newImg.uploadedMimeType;
    currentImageWidth = originalImage.width;
    currentImageHeight = originalImage.height;
    
    // Copy parameters
    Object.assign(sliders, newImg.slidersState);
    Object.keys(curvePoints).forEach(key => {
        curvePoints[key] = JSON.parse(JSON.stringify(newImg.curvesState[key]));
    });
    cropAngle = newImg.cropState.cropAngle;
    cropFlipH = newImg.cropState.cropFlipH;
    cropFlipV = newImg.cropState.cropFlipV;
    cropRotate90 = newImg.cropState.cropRotate90;
    cropRect = { ...newImg.cropState.cropRect };
    
    // 3. Reset canvases/textures
    uploadPlaceholder.style.display = "none";
    canvas.style.display = "block";
    
    const maxDisplaySize = 1200;
    let displayWidth = currentImageWidth;
    let displayHeight = currentImageHeight;
    
    if (displayWidth > maxDisplaySize || displayHeight > maxDisplaySize) {
        if (displayWidth > displayHeight) {
            displayHeight = (maxDisplaySize / displayWidth) * displayHeight;
            displayWidth = maxDisplaySize;
        } else {
            displayWidth = (maxDisplaySize / displayHeight) * displayWidth;
            displayHeight = maxDisplaySize;
        }
    }

    canvas.width = displayWidth;
    canvas.height = displayHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);

    if (imageTexture) {
        gl.deleteTexture(imageTexture);
    }
    imageTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, originalImage);

    // 4. Update UI sliders and curve graph
    syncSlidersToUI();
    deactivateCropUI();
    updateLutTextures();
    drawToneCurveCanvas();
    updateFilmstripUI();
    
    // Clear undo/redo lists on swap
    undoStack.length = 0;
    redoStack.length = 0;
    
    render();
    drawHistogram();
    
    zoomToolbar.style.display = "flex";
    setTimeout(zoomFit, 100);
}

function syncSlidersToUI() {
    // Trigger input events to synchronize UI indicators
    Object.keys(sliders).forEach(key => {
        const slider = document.getElementById(`slider-${key}`);
        const valDisplay = document.getElementById(`val-${key}`);
        if (!slider) return;
        
        let value = sliders[key];
        
        if (key === "exposure") {
            slider.value = value * 100;
            valDisplay.textContent = (value >= 0 ? "+" : "") + value.toFixed(2);
        } else if (key === "cgBlending") {
            slider.value = value * 100;
            valDisplay.textContent = Math.round(value * 100).toString();
        } else if (key.endsWith("Hue") && key.startsWith("cg")) {
            slider.value = value * 360;
            valDisplay.textContent = Math.round(value * 360).toString() + "°";
        } else if (key.startsWith("detail") || key === "grain") {
            slider.value = value * 100;
            valDisplay.textContent = Math.round(value * 100).toString();
        } else {
            slider.value = value * 100;
            valDisplay.textContent = (value >= 0 ? "+" : "") + Math.round(value * 100);
        }
    });

    // Sync HSL
    HSL_TABS.forEach(tab => {
        HSL_COLORS.forEach(color => {
            const key = `${tab}${color.id}`;
            const slider = document.getElementById(`slider-${key}`);
            const valDisplay = document.getElementById(`val-${key}`);
            if (slider && valDisplay) {
                const percentVal = Math.round(sliders[key] * 100);
                slider.value = percentVal;
                valDisplay.textContent = (percentVal >= 0 ? "+" : "") + percentVal;
            }
        });
    });
    
    // Sync crop angle slider
    sliderCropAngle.value = cropAngle;
    valCropAngle.textContent = (cropAngle >= 0 ? "+" : "") + cropAngle + "°";
    selectAspect.value = activeAspect;
}


// ----------------- CUSTOM PRESET ACTIONS -----------------

function loadCustomPresets() {
    const raw = localStorage.getItem("lr_custom_presets");
    if (raw) {
        try {
            customPresets = JSON.parse(raw);
        } catch (e) {
            customPresets = {};
        }
    }
    updateCustomPresetsUI();
}

function saveCustomPresets() {
    localStorage.setItem("lr_custom_presets", JSON.stringify(customPresets));
    updateCustomPresetsUI();
}

function updateCustomPresetsUI() {
    customPresetsList.innerHTML = "";
    const keys = Object.keys(customPresets);
    
    if (keys.length > 0) {
        customPresetsHeader.style.display = "block";
    } else {
        customPresetsHeader.style.display = "none";
    }
    
    keys.forEach(name => {
        const btn = document.createElement("button");
        btn.className = "preset-btn";
        btn.style.display = "flex";
        btn.style.justifyContent = "space-between";
        btn.style.alignItems = "center";
        
        const label = document.createElement("span");
        label.textContent = name;
        btn.appendChild(label);
        
        const delBtn = document.createElement("button");
        delBtn.className = "preset-delete-btn";
        delBtn.textContent = "✕";
        delBtn.title = "Xoá bộ lọc này";
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm(`Bạn muốn xoá bộ lọc "${name}"?`)) {
                delete customPresets[name];
                saveCustomPresets();
            }
        });
        
        btn.appendChild(delBtn);
        
        btn.addEventListener("click", () => {
            applyCustomPreset(name);
        });
        
        customPresetsList.appendChild(btn);
    });
}

btnCreatePreset.addEventListener("click", () => {
    if (!originalImage) return;
    const name = prompt("Nhập tên bộ lọc (Preset) mới của bạn:");
    if (!name || name.trim() === "") return;
    
    const presetName = name.trim();
    if (PRESETS[presetName] || customPresets[presetName]) {
        alert("Tên bộ lọc đã tồn tại!");
        return;
    }
    
    // Save sliders & curves values
    customPresets[presetName] = {
        sliders: { ...sliders },
        curves: JSON.parse(JSON.stringify(curvePoints))
    };
    
    saveCustomPresets();
    addHistoryStep(`Đã tạo bộ lọc: ${presetName}`);
});

function applyCustomPreset(name) {
    const config = customPresets[name];
    if (!config) return;
    
    saveUndoState();
    
    // Reset parameter
    Object.assign(sliders, config.sliders);
    Object.keys(curvePoints).forEach(key => {
        if (config.curves && config.curves[key]) {
            curvePoints[key] = JSON.parse(JSON.stringify(config.curves[key]));
        } else {
            curvePoints[key] = [[0,0], [1,1]];
        }
    });
    
    syncSlidersToUI();
    updateLutTextures();
    drawToneCurveCanvas();
    render();
    drawHistogram();
    addHistoryStep(`Áp dụng bộ lọc cá nhân: ${name}`);
}


// ----------------- UNDO & REDO MECHANISM -----------------

function saveUndoState() {
    const state = {
        sliders: { ...sliders },
        curves: JSON.parse(JSON.stringify(curvePoints)),
        crop: {
            cropAngle, cropFlipH, cropFlipV, cropRotate90,
            cropRect: { ...cropRect }
        }
    };
    
    undoStack.push(state);
    if (undoStack.length > MAX_STACK_SIZE) {
        undoStack.shift();
    }
    
    // Clear redo stack on new action
    redoStack.length = 0;
}

function performUndo() {
    if (undoStack.length === 0) return;
    
    const currentState = {
        sliders: { ...sliders },
        curves: JSON.parse(JSON.stringify(curvePoints)),
        crop: {
            cropAngle, cropFlipH, cropFlipV, cropRotate90,
            cropRect: { ...cropRect }
        }
    };
    redoStack.push(currentState);
    
    const prevState = undoStack.pop();
    Object.assign(sliders, prevState.sliders);
    Object.keys(curvePoints).forEach(key => {
        curvePoints[key] = JSON.parse(JSON.stringify(prevState.curves[key]));
    });
    cropAngle = prevState.crop.cropAngle;
    cropFlipH = prevState.crop.cropFlipH;
    cropFlipV = prevState.crop.cropFlipV;
    cropRotate90 = prevState.crop.cropRotate90;
    cropRect = { ...prevState.crop.cropRect };
    
    syncSlidersToUI();
    updateLutTextures();
    drawToneCurveCanvas();
    render();
    drawHistogram();
    
    addHistoryStep("Hoàn tác (Undo)");
}

function performRedo() {
    if (redoStack.length === 0) return;
    
    const currentState = {
        sliders: { ...sliders },
        curves: JSON.parse(JSON.stringify(curvePoints)),
        crop: {
            cropAngle, cropFlipH, cropFlipV, cropRotate90,
            cropRect: { ...cropRect }
        }
    };
    undoStack.push(currentState);
    
    const nextState = redoStack.pop();
    Object.assign(sliders, nextState.sliders);
    Object.keys(curvePoints).forEach(key => {
        curvePoints[key] = JSON.parse(JSON.stringify(nextState.curves[key]));
    });
    cropAngle = nextState.crop.cropAngle;
    cropFlipH = nextState.crop.cropFlipH;
    cropFlipV = nextState.crop.cropFlipV;
    cropRotate90 = nextState.crop.cropRotate90;
    cropRect = { ...nextState.crop.cropRect };
    
    syncSlidersToUI();
    updateLutTextures();
    drawToneCurveCanvas();
    render();
    drawHistogram();
    
    addHistoryStep("Làm lại (Redo)");
}


// ----------------- STANDARD LR CORE ACTIONS -----------------

// Zoom Controls
function applyZoom() {
    if (!originalImage) return;
    canvas.style.width = `${canvas.width * (currentZoom / 100)}px`;
    canvas.style.height = `${canvas.height * (currentZoom / 100)}px`;
    zoomSlider.value = currentZoom;
    zoomValue.textContent = `${Math.round(currentZoom)}%`;
    if (isCropActive) drawCropOverlayFromRect();
}

function zoomFit() {
    if (!originalImage) return;
    const containerWidth = canvasScroll.clientWidth - 40;
    const containerHeight = canvasScroll.clientHeight - 40;
    const ratioX = containerWidth / canvas.width;
    const ratioY = containerHeight / canvas.height;
    
    currentZoom = Math.min(ratioX, ratioY, 1.0) * 100;
    applyZoom();
}

// Generate color mixer channel sliders
function initColorMixerSliders() {
    const container = document.getElementById("mixer-sliders-container");
    if (!container) return;
    
    container.innerHTML = "";
    
    HSL_TABS.forEach(tab => {
        const groupDiv = document.createElement("div");
        groupDiv.className = `mixer-controls-group ${tab === "hue" ? "active" : ""}`;
        groupDiv.id = `mixer-${tab}-group`;
        
        HSL_COLORS.forEach(color => {
            const controlDiv = document.createElement("div");
            controlDiv.className = `slider-control ${color.class}`;
            
            const sliderKey = `${tab}${color.id}`;
            
            const infoDiv = document.createElement("div");
            infoDiv.className = "slider-info";
            
            const nameSpan = document.createElement("span");
            nameSpan.className = "slider-name";
            nameSpan.textContent = color.label;
            
            const valueSpan = document.createElement("span");
            valueSpan.className = "slider-value";
            valueSpan.id = `val-${sliderKey}`;
            valueSpan.textContent = "0";
            
            infoDiv.appendChild(nameSpan);
            infoDiv.appendChild(valueSpan);
            
            const input = document.createElement("input");
            input.type = "range";
            input.id = `slider-${sliderKey}`;
            input.min = "-100";
            input.max = "100";
            input.value = "0";
            input.className = "slider-input";
            
            input.addEventListener("input", (e) => {
                const val = parseInt(e.target.value);
                sliders[sliderKey] = val / 100.0;
                valueSpan.textContent = (val >= 0 ? "+" : "") + val;
                
                render();
                scheduleHistogramUpdate();
            });
            
            input.addEventListener("change", (e) => {
                const val = parseInt(e.target.value);
                addHistoryStep(`Trộn màu ${color.label} (${tab.toUpperCase()}): ${(val >= 0 ? "+" : "") + val}`);
            });
            
            controlDiv.appendChild(infoDiv);
            controlDiv.appendChild(input);
            groupDiv.appendChild(controlDiv);
        });
        
        container.appendChild(groupDiv);
    });
    
    // Tab switching
    document.querySelectorAll("#color-mixer-content .mixer-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll("#color-mixer-content .mixer-tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            
            const activeTab = e.target.dataset.tab;
            document.querySelectorAll(".mixer-controls-group").forEach(group => {
                group.classList.remove("active");
            });
            document.getElementById(`mixer-${activeTab}-group`).classList.add("active");
        });
    });
}

function initColorGradingTabs() {
    document.querySelectorAll("#title-color-grading + .slider-section-content .mixer-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll("#title-color-grading + .slider-section-content .mixer-tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            
            const activeCgTab = e.target.dataset.cgtab;
            document.querySelectorAll(".cg-controls-group").forEach(group => {
                group.style.display = "none";
                group.classList.remove("active");
            });
            
            const activeGroup = document.getElementById(`cg-${activeCgTab}-group`);
            if (activeGroup) {
                activeGroup.style.display = "flex";
                activeGroup.classList.add("active");
            }
        });
    });
}

function setupSliders() {
    const sliderIds = [
        "temp", "tint", "exposure", "contrast", "highlights", "shadows", "whites", "blacks", "vibrance", "saturation",
        "clarity", "dehaze", "vignette", "grain",
        "cgShadowsHue", "cgShadowsSat", "cgShadowsLum",
        "cgMidtonesHue", "cgMidtonesSat", "cgMidtonesLum",
        "cgHighlightsHue", "cgHighlightsSat", "cgHighlightsLum",
        "cgGlobalHue", "cgGlobalSat", "cgGlobalLum",
        "cgBlending", "cgBalance",
        "detailSharpening", "detailNoise",
        "calShadowTint",
        "calRedHue", "calRedSat",
        "calGreenHue", "calGreenSat",
        "calBlueHue", "calBlueSat"
    ];
    
    sliderIds.forEach(id => {
        const slider = document.getElementById(`slider-${id}`);
        const valDisplay = document.getElementById(`val-${id}`);
        
        if (!slider) return;
        
        slider.addEventListener("input", (e) => {
            let val = parseFloat(e.target.value);
            
            if (id === "exposure") {
                sliders[id] = val / 100.0;
                valDisplay.textContent = (sliders[id] >= 0 ? "+" : "") + sliders[id].toFixed(2);
            } else if (id === "cgBlending") {
                sliders[id] = val / 100.0;
                valDisplay.textContent = val.toString();
            } else if (id.endsWith("Hue") && id.startsWith("cg")) {
                sliders[id] = val / 360.0;
                valDisplay.textContent = val.toString() + "°";
            } else if (id.startsWith("detail") || id === "grain") {
                sliders[id] = val / 100.0;
                valDisplay.textContent = val.toString();
            } else {
                sliders[id] = val / 100.0;
                valDisplay.textContent = (val >= 0 ? "+" : "") + val;
            }
            
            render();
            scheduleHistogramUpdate();
        });
        
        slider.addEventListener("change", () => {
            addHistoryStep(`Chỉnh slider ${getSliderLabel(id)}: ${valDisplay.textContent}`);
        });
    });
}

function getSliderLabel(id) {
    const labels = {
        temp: "Nhiệt độ", tint: "Sắc thái", exposure: "Phơi sáng", contrast: "Tương phản",
        highlights: "Vùng sáng", shadows: "Vùng tối", whites: "Whites", blacks: "Blacks",
        vibrance: "Vibrance", saturation: "Bão hòa", clarity: "Clarity", dehaze: "Dehaze",
        vignette: "Vignette", grain: "Hạt film",
        cgShadowsHue: "Phủ màu Tối - Hue", cgShadowsSat: "Phủ màu Tối - Sat", cgShadowsLum: "Phủ màu Tối - Lum",
        cgMidtonesHue: "Phủ màu Trung - Hue", cgMidtonesSat: "Phủ màu Trung - Sat", cgMidtonesLum: "Phủ màu Trung - Lum",
        cgHighlightsHue: "Phủ màu Sáng - Hue", cgHighlightsSat: "Phủ màu Sáng - Sat", cgHighlightsLum: "Phủ màu Sáng - Lum",
        cgGlobalHue: "Phủ màu Toàn Cục - Hue", cgGlobalSat: "Phủ màu Toàn Cục - Sat", cgGlobalLum: "Phủ màu Toàn Cục - Lum",
        cgBlending: "Phủ màu - Blending", cgBalance: "Phủ màu - Balance",
        detailSharpening: "Làm nét", detailNoise: "Khử nhiễu",
        calShadowTint: "Calibration - Shadow Tint",
        calRedHue: "Calibration - Red Hue", calRedSat: "Calibration - Red Sat",
        calGreenHue: "Calibration - Green Hue", calGreenSat: "Calibration - Green Sat",
        calBlueHue: "Calibration - Blue Hue", calBlueSat: "Calibration - Blue Sat"
    };
    return labels[id] || id;
}

function resetSliders() {
    saveUndoState();
    
    // Clear Tone Curves points to default
    Object.keys(curvePoints).forEach(key => {
        curvePoints[key] = [[0, 0], [1, 1]];
    });
    selectedPointIndex = -1;
    
    // Clear crop transformation
    cropAngle = 0;
    cropFlipH = 1;
    cropFlipV = 1;
    cropRotate90 = 0;
    cropRect = { x: 0, y: 0, w: 1, h: 1 };
    activeAspect = "free";
    
    // Reset standard sliders
    Object.keys(sliders).forEach(id => {
        if (id === "cgBlending") {
            sliders[id] = 0.5;
        } else {
            sliders[id] = 0;
        }
    });
    
    syncSlidersToUI();
    updateLutTextures();
    drawToneCurveCanvas();
    render();
    drawHistogram();
}

function applyPreset(presetName) {
    const preset = PRESETS[presetName];
    if (!preset) return;
    
    saveUndoState();
    
    // Clear curves to flat default
    Object.keys(curvePoints).forEach(key => {
        curvePoints[key] = [[0, 0], [1, 1]];
    });
    selectedPointIndex = -1;
    
    Object.assign(sliders, PRESETS.default); // reset all sliders to default first
    Object.assign(sliders, preset);
    
    syncSlidersToUI();
    updateLutTextures();
    drawToneCurveCanvas();
    render();
    drawHistogram();
    addHistoryStep(`Áp dụng Preset: ${presetName.toUpperCase()}`);
}

function setupEventListeners() {
    // Accordion
    document.querySelectorAll(".slider-section-title").forEach(title => {
        title.addEventListener("click", (e) => {
            const section = e.target.closest(".slider-section");
            section.classList.toggle("open");
        });
    });

    // File Input change
    uploadInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            loadMultipleImages(e.target.files);
        }
    });

    // Drag Drop
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drag-over");
    });
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) {
            loadMultipleImages(e.dataTransfer.files);
        }
    });

    // Presets
    document.querySelectorAll(".preset-btn[data-preset]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            applyPreset(e.target.dataset.preset);
        });
    });

    btnReset.addEventListener("click", () => {
        resetSliders();
        addHistoryStep("Khôi phục toàn bộ thanh trượt");
    });

    // History Actions (Undo, Redo, Reset)
    if (btnActionUndo) {
        btnActionUndo.addEventListener("click", () => {
            performUndo();
        });
    }
    if (btnActionRedo) {
        btnActionRedo.addEventListener("click", () => {
            performRedo();
        });
    }
    if (btnActionReset) {
        btnActionReset.addEventListener("click", () => {
            resetSliders();
            addHistoryStep("Khôi phục toàn bộ thanh trượt");
        });
    }
    
    btnExport.addEventListener("click", exportImage);

    // Before After View (Hold down button)
    btnBeforeAfter.addEventListener("mousedown", () => {
        isOriginalView = true;
        render();
    });
    btnBeforeAfter.addEventListener("mouseup", () => {
        isOriginalView = false;
        render();
    });
    btnBeforeAfter.addEventListener("mouseleave", () => {
        if (isOriginalView) {
            isOriginalView = false;
            render();
        }
    });
    
    // Zoom UI
    zoomSlider.addEventListener("input", (e) => {
        currentZoom = parseInt(e.target.value);
        applyZoom();
    });
    btnZoomOut.addEventListener("click", () => {
        currentZoom = Math.max(10, currentZoom - 10);
        applyZoom();
    });
    btnZoomIn.addEventListener("click", () => {
        currentZoom = Math.min(200, currentZoom + 10);
        applyZoom();
    });
    btnZoomFit.addEventListener("click", zoomFit);

    // Ctrl + Scroll zoom
    canvasScroll.addEventListener("wheel", (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                currentZoom = Math.min(200, currentZoom + 5);
            } else {
                currentZoom = Math.max(10, currentZoom - 5);
            }
            applyZoom();
        }
    }, { passive: false });

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
        // Alt / Backslash key to preview original
        if (e.key === "\\" && !isOriginalView) {
            isOriginalView = true;
            render();
        }
        
        // Undo shortcut: Ctrl + Z
        if (e.ctrlKey && e.key.toLowerCase() === "z") {
            e.preventDefault();
            performUndo();
        }
        
        // Redo shortcut: Ctrl + Y
        if (e.ctrlKey && e.key.toLowerCase() === "y") {
            e.preventDefault();
            performRedo();
        }

        // Toggle crop: C key
        if (e.key.toLowerCase() === "c" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "SELECT") {
            e.preventDefault();
            btnCropToggle.click();
        }

        // Toggle split: Y key
        if (e.key.toLowerCase() === "y" && !e.ctrlKey && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "SELECT") {
            e.preventDefault();
            btnSplitView.click();
        }
    });
    
    window.addEventListener("keyup", (e) => {
        if (e.key === "\\" && isOriginalView) {
            isOriginalView = false;
            render();
        }
    });
}

// Load multiple files into Filmstrip list
function loadMultipleImages(files) {
    let imagesLoaded = 0;
    const initialListLength = imageList.length;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;

        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const imgId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 5);
                const imgObj = {
                    id: imgId,
                    name: file.name,
                    dataUrl: event.target.result,
                    originalImage: img,
                    uploadedMimeType: file.type || "image/jpeg",
                    
                    // Duplicate parameters structure for isolate state editing
                    slidersState: { ...PRESETS.default },
                    curvesState: {
                        RGB: [[0, 0], [1, 1]],
                        Red: [[0, 0], [1, 1]],
                        Green: [[0, 0], [1, 1]],
                        Blue: [[0, 0], [1, 1]]
                    },
                    cropState: {
                        cropAngle: 0,
                        cropFlipH: 1,
                        cropFlipV: 1,
                        cropRotate90: 0,
                        cropRect: { x: 0, y: 0, w: 1, h: 1 }
                    }
                };

                imageList.push(imgObj);
                imagesLoaded++;

                // Once all images loaded, render filmstrip and switch to first newly loaded image
                if (imagesLoaded === files.length || i === files.length - 1) {
                    updateFilmstripUI();
                    
                    // If it was empty workspace previously, activate the first image immediately
                    if (initialListLength === 0 && imageList.length > 0) {
                        switchActiveImage(imageList[0].id);
                    }
                }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// Render WebGL
function render() {
    drawToneCurveCanvas();
    if (!originalImage || !imageTexture) return;

    gl.useProgram(program);

    // Geometry parameters matrix
    const uvMatrix = getUVTransformMatrix();
    gl.uniformMatrix3fv(gl.getUniformLocation(program, "u_uvTransform"), false, uvMatrix);

    // Split view comparison parameter
    gl.uniform1f(gl.getUniformLocation(program, "u_splitRatio"), splitRatio);
    gl.uniform1f(gl.getUniformLocation(program, "u_isSplitActive"), isSplitActive ? 1.0 : 0.0);

    // Standard parameter binding
    gl.uniform1f(gl.getUniformLocation(program, "u_temp"), isOriginalView ? 0.0 : sliders.temp);
    gl.uniform1f(gl.getUniformLocation(program, "u_tint"), isOriginalView ? 0.0 : sliders.tint);
    gl.uniform1f(gl.getUniformLocation(program, "u_exposure"), isOriginalView ? 0.0 : sliders.exposure);
    gl.uniform1f(gl.getUniformLocation(program, "u_contrast"), isOriginalView ? 0.0 : sliders.contrast);
    gl.uniform1f(gl.getUniformLocation(program, "u_highlights"), isOriginalView ? 0.0 : sliders.highlights);
    gl.uniform1f(gl.getUniformLocation(program, "u_shadows"), isOriginalView ? 0.0 : sliders.shadows);
    gl.uniform1f(gl.getUniformLocation(program, "u_whites"), isOriginalView ? 0.0 : sliders.whites);
    gl.uniform1f(gl.getUniformLocation(program, "u_blacks"), isOriginalView ? 0.0 : sliders.blacks);
    gl.uniform1f(gl.getUniformLocation(program, "u_vibrance"), isOriginalView ? 0.0 : sliders.vibrance);
    gl.uniform1f(gl.getUniformLocation(program, "u_saturation"), isOriginalView ? 0.0 : sliders.saturation);
    gl.uniform1f(gl.getUniformLocation(program, "u_clarity"), isOriginalView ? 0.0 : sliders.clarity);
    gl.uniform1f(gl.getUniformLocation(program, "u_dehaze"), isOriginalView ? 0.0 : sliders.dehaze);
    gl.uniform1f(gl.getUniformLocation(program, "u_vignette"), isOriginalView ? 0.0 : sliders.vignette);
    gl.uniform1f(gl.getUniformLocation(program, "u_grain"), isOriginalView ? 0.0 : sliders.grain);

    // 1D LUT Texture Bindings
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, lutTextures.RGB);
    gl.uniform1i(gl.getUniformLocation(program, "u_rgbLut"), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, lutTextures.Red);
    gl.uniform1i(gl.getUniformLocation(program, "u_redLut"), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, lutTextures.Green);
    gl.uniform1i(gl.getUniformLocation(program, "u_greenLut"), 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, lutTextures.Blue);
    gl.uniform1i(gl.getUniformLocation(program, "u_blueLut"), 4);

    // HSL Bindings
    HSL_TABS.forEach(tab => {
        HSL_COLORS.forEach(color => {
            const key = `${tab}${color.id}`;
            const uniformName = `u_${tab}${color.id}`;
            gl.uniform1f(gl.getUniformLocation(program, uniformName), isOriginalView ? 0.0 : sliders[key]);
        });
    });

    // Color Grading 3-Way Bindings
    gl.uniform1f(gl.getUniformLocation(program, "u_cgShadowsHue"), isOriginalView ? 0.0 : sliders.cgShadowsHue);
    gl.uniform1f(gl.getUniformLocation(program, "u_cgShadowsSat"), isOriginalView ? 0.0 : sliders.cgShadowsSat / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_cgShadowsLum"), isOriginalView ? 0.0 : sliders.cgShadowsLum / 100.0);

    gl.uniform1f(gl.getUniformLocation(program, "u_cgMidtonesHue"), isOriginalView ? 0.0 : sliders.cgMidtonesHue);
    gl.uniform1f(gl.getUniformLocation(program, "u_cgMidtonesSat"), isOriginalView ? 0.0 : sliders.cgMidtonesSat / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_cgMidtonesLum"), isOriginalView ? 0.0 : sliders.cgMidtonesLum / 100.0);

    gl.uniform1f(gl.getUniformLocation(program, "u_cgHighlightsHue"), isOriginalView ? 0.0 : sliders.cgHighlightsHue);
    gl.uniform1f(gl.getUniformLocation(program, "u_cgHighlightsSat"), isOriginalView ? 0.0 : sliders.cgHighlightsSat / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_cgHighlightsLum"), isOriginalView ? 0.0 : sliders.cgHighlightsLum / 100.0);

    gl.uniform1f(gl.getUniformLocation(program, "u_cgGlobalHue"), isOriginalView ? 0.0 : sliders.cgGlobalHue);
    gl.uniform1f(gl.getUniformLocation(program, "u_cgGlobalSat"), isOriginalView ? 0.0 : sliders.cgGlobalSat / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_cgGlobalLum"), isOriginalView ? 0.0 : sliders.cgGlobalLum / 100.0);

    gl.uniform1f(gl.getUniformLocation(program, "u_cgBlending"), isOriginalView ? 0.5 : sliders.cgBlending);
    gl.uniform1f(gl.getUniformLocation(program, "u_cgBalance"), isOriginalView ? 0.0 : sliders.cgBalance / 100.0);

    // Detail Bindings
    gl.uniform1f(gl.getUniformLocation(program, "u_detailSharpening"), isOriginalView ? 0.0 : sliders.detailSharpening);
    gl.uniform1f(gl.getUniformLocation(program, "u_detailNoise"), isOriginalView ? 0.0 : sliders.detailNoise);

    // Calibration Bindings
    gl.uniform1f(gl.getUniformLocation(program, "u_calShadowTint"), isOriginalView ? 0.0 : sliders.calShadowTint / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_calRedHue"), isOriginalView ? 0.0 : sliders.calRedHue / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_calRedSat"), isOriginalView ? 0.0 : sliders.calRedSat / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_calGreenHue"), isOriginalView ? 0.0 : sliders.calGreenHue / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_calGreenSat"), isOriginalView ? 0.0 : sliders.calGreenSat / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_calBlueHue"), isOriginalView ? 0.0 : sliders.calBlueHue / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_calBlueSat"), isOriginalView ? 0.0 : sliders.calBlueSat / 100.0);

    // Texture image load
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);
    gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// Export Full Resolution Lossless image
function exportImage() {
    if (!originalImage) return;

    // Calculate dimensions based on crop factor & rotations
    // If rotate 90 or 270, width and height swaps
    const isSwapped = (cropRotate90 === 90 || cropRotate90 === 270);
    const targetW = Math.round(currentImageWidth * (isSwapped ? cropRect.h : cropRect.w));
    const targetH = Math.round(currentImageHeight * (isSwapped ? cropRect.w : cropRect.h));

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = targetW;
    exportCanvas.height = targetH;
    
    const exportGl = exportCanvas.getContext("webgl", { preserveDrawingBuffer: true });
    if (!exportGl) {
        alert("Lỗi WebGL export!");
        return;
    }

    const vs = compileShader(exportGl, vsSource, exportGl.VERTEX_SHADER);
    const fs = compileShader(exportGl, fsSource, exportGl.FRAGMENT_SHADER);
    const exportProgram = exportGl.createProgram();
    exportGl.attachShader(exportProgram, vs);
    exportGl.attachShader(exportProgram, fs);
    exportGl.linkProgram(exportProgram);

    exportGl.viewport(0, 0, exportCanvas.width, exportCanvas.height);

    const posLocation = exportGl.getAttribLocation(exportProgram, "a_position");
    const texLocation = exportGl.getAttribLocation(exportProgram, "a_texCoord");

    const posBuf = exportGl.createBuffer();
    exportGl.bindBuffer(exportGl.ARRAY_BUFFER, posBuf);
    exportGl.bufferData(exportGl.ARRAY_BUFFER, new Float32Array([
        -1.0, -1.0,  1.0, -1.0, -1.0,  1.0,
        -1.0,  1.0,  1.0, -1.0,  1.0,  1.0,
    ]), exportGl.STATIC_DRAW);
    exportGl.enableVertexAttribArray(posLocation);
    exportGl.vertexAttribPointer(posLocation, 2, exportGl.FLOAT, false, 0, 0);

    const texBuf = exportGl.createBuffer();
    exportGl.bindBuffer(exportGl.ARRAY_BUFFER, texBuf);
    exportGl.bufferData(exportGl.ARRAY_BUFFER, new Float32Array([
        0.0, 1.0,  1.0, 1.0,  0.0, 0.0,
        0.0, 0.0,  1.0, 1.0,  1.0, 0.0,
    ]), exportGl.STATIC_DRAW);
    exportGl.enableVertexAttribArray(texLocation);
    exportGl.vertexAttribPointer(texLocation, 2, exportGl.FLOAT, false, 0, 0);

    const tex = exportGl.createTexture();
    exportGl.bindTexture(exportGl.TEXTURE_2D, tex);
    exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_WRAP_S, exportGl.CLAMP_TO_EDGE);
    exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_WRAP_T, exportGl.CLAMP_TO_EDGE);
    exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_MIN_FILTER, exportGl.LINEAR);
    exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_MAG_FILTER, exportGl.LINEAR);
    exportGl.texImage2D(exportGl.TEXTURE_2D, 0, exportGl.RGBA, exportGl.RGBA, exportGl.UNSIGNED_BYTE, originalImage);

    // Build independent LUTs for export context
    const exportLuts = {};
    ["RGB", "Red", "Green", "Blue"].forEach(channel => {
        exportLuts[channel] = exportGl.createTexture();
        exportGl.bindTexture(exportGl.TEXTURE_2D, exportLuts[channel]);
        exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_WRAP_S, exportGl.CLAMP_TO_EDGE);
        exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_WRAP_T, exportGl.CLAMP_TO_EDGE);
        exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_MIN_FILTER, exportGl.LINEAR);
        exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_MAG_FILTER, exportGl.LINEAR);
        
        const lutData = generateLutData(curvePoints[channel]);
        exportGl.texImage2D(exportGl.TEXTURE_2D, 0, exportGl.RGBA, 256, 1, 0, exportGl.RGBA, exportGl.UNSIGNED_BYTE, lutData);
    });

    exportGl.useProgram(exportProgram);
    
    // Geometry matrix (Forced to zoom in on crop area in the exported output)
    const oldCropActive = isCropActive;
    isCropActive = false; // force crop translation into matrix
    const uvMatrix = getUVTransformMatrix();
    isCropActive = oldCropActive; // restore state
    exportGl.uniformMatrix3fv(exportGl.getUniformLocation(exportProgram, "u_uvTransform"), false, uvMatrix);

    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_isSplitActive"), 0.0); // No split in export

    // Bind parameters
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_temp"), sliders.temp);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_tint"), sliders.tint);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_exposure"), sliders.exposure);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_contrast"), sliders.contrast);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_highlights"), sliders.highlights);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_shadows"), sliders.shadows);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_whites"), sliders.whites);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_blacks"), sliders.blacks);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_vibrance"), sliders.vibrance);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_saturation"), sliders.saturation);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_clarity"), sliders.clarity);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_dehaze"), sliders.dehaze);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_vignette"), sliders.vignette);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_grain"), sliders.grain);

    exportGl.activeTexture(exportGl.TEXTURE1);
    exportGl.bindTexture(exportGl.TEXTURE_2D, exportLuts.RGB);
    exportGl.uniform1i(exportGl.getUniformLocation(exportProgram, "u_rgbLut"), 1);

    exportGl.activeTexture(exportGl.TEXTURE2);
    exportGl.bindTexture(exportGl.TEXTURE_2D, exportLuts.Red);
    exportGl.uniform1i(exportGl.getUniformLocation(exportProgram, "u_redLut"), 2);

    exportGl.activeTexture(exportGl.TEXTURE3);
    exportGl.bindTexture(exportGl.TEXTURE_2D, exportLuts.Green);
    exportGl.uniform1i(exportGl.getUniformLocation(exportProgram, "u_greenLut"), 3);

    exportGl.activeTexture(exportGl.TEXTURE4);
    exportGl.bindTexture(exportGl.TEXTURE_2D, exportLuts.Blue);
    exportGl.uniform1i(exportGl.getUniformLocation(exportProgram, "u_blueLut"), 4);

    HSL_TABS.forEach(tab => {
        HSL_COLORS.forEach(color => {
            exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, `u_${tab}${color.id}`), sliders[`${tab}${color.id}`]);
        });
    });

    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgShadowsHue"), sliders.cgShadowsHue);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgShadowsSat"), sliders.cgShadowsSat / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgShadowsLum"), sliders.cgShadowsLum / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgMidtonesHue"), sliders.cgMidtonesHue);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgMidtonesSat"), sliders.cgMidtonesSat / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgMidtonesLum"), sliders.cgMidtonesLum / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgHighlightsHue"), sliders.cgHighlightsHue);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgHighlightsSat"), sliders.cgHighlightsSat / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgHighlightsLum"), sliders.cgHighlightsLum / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgGlobalHue"), sliders.cgGlobalHue);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgGlobalSat"), sliders.cgGlobalSat / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgGlobalLum"), sliders.cgGlobalLum / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgBlending"), sliders.cgBlending);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_cgBalance"), sliders.cgBalance / 100.0);

    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_detailSharpening"), sliders.detailSharpening);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_detailNoise"), sliders.detailNoise);

    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_calShadowTint"), sliders.calShadowTint / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_calRedHue"), sliders.calRedHue / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_calRedSat"), sliders.calRedSat / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_calGreenHue"), sliders.calGreenHue / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_calGreenSat"), sliders.calGreenSat / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_calBlueHue"), sliders.calBlueHue / 100.0);
    exportGl.uniform1f(exportGl.getUniformLocation(exportProgram, "u_calBlueSat"), sliders.calBlueSat / 100.0);

    exportGl.activeTexture(exportGl.TEXTURE0);
    exportGl.bindTexture(exportGl.TEXTURE_2D, tex);
    exportGl.uniform1i(exportGl.getUniformLocation(exportProgram, "u_image"), 0);

    exportGl.drawArrays(exportGl.TRIANGLES, 0, 6);

    // Trigger download
    const link = document.createElement("a");
    const extension = uploadedMimeType === "image/png" ? "png" : "jpg";
    link.download = `${imageList.find(img=>img.id===activeImageId).name.split('.')[0]}_LrEdited.${extension}`;
    link.href = exportCanvas.toDataURL(uploadedMimeType, 1.0); // 1.0 = Quality lossless
    link.click();
    
    addHistoryStep("Xuất ảnh chất lượng cao 100%");
}

function scheduleHistogramUpdate() {
    if (updateHistogramTimeout) {
        clearTimeout(updateHistogramTimeout);
    }
    updateHistogramTimeout = setTimeout(drawHistogram, 60);
}

function drawHistogram() {
    if (!originalImage) return;

    const histCanvas = document.getElementById("histogram-canvas");
    const ctx = histCanvas.getContext("2d");
    const width = histCanvas.width;
    const height = histCanvas.height;

    ctx.clearRect(0, 0, width, height);

    // Read pixel data from screen buffer
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const rHist = new Array(256).fill(0);
    const gHist = new Array(256).fill(0);
    const bHist = new Array(256).fill(0);

    for (let i = 0; i < pixels.length; i += 4) {
        rHist[pixels[i]]++;
        gHist[pixels[i + 1]]++;
        bHist[pixels[i + 2]]++;
    }

    let maxCount = 0;
    for (let i = 0; i < 256; i++) {
        if (rHist[i] > maxCount) maxCount = rHist[i];
        if (gHist[i] > maxCount) maxCount = gHist[i];
        if (bHist[i] > maxCount) maxCount = bHist[i];
    }

    if (maxCount === 0) return;

    ctx.lineWidth = 1.5;
    ctx.globalCompositeOperation = "screen";

    // Red
    ctx.strokeStyle = "rgba(255, 69, 58, 0.65)";
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
        const x = (i / 255) * width;
        const y = height - (rHist[i] / maxCount) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Green
    ctx.strokeStyle = "rgba(48, 209, 88, 0.65)";
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
        const x = (i / 255) * width;
        const y = height - (gHist[i] / maxCount) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Blue
    ctx.strokeStyle = "rgba(10, 132, 255, 0.65)";
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
        const x = (i / 255) * width;
        const y = height - (bHist[i] / maxCount) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function addHistoryStep(label) {
    historyList.innerHTML = "";
    
    const rootItem = document.createElement("div");
    rootItem.className = "history-item";
    rootItem.textContent = "Mở ảnh gốc";
    rootItem.addEventListener("click", () => {
        resetSliders();
    });
    historyList.appendChild(rootItem);

    // Simple history list visual tracker
    const item = document.createElement("div");
    item.className = "history-item active";
    item.textContent = label;
    historyList.appendChild(item);
}

// Dom Loaded entry point
window.addEventListener("DOMContentLoaded", init);
