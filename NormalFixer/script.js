const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const canvasInput = document.getElementById('canvasInput');
const canvasOutput = document.getElementById('canvasOutput');
const btnGL = document.getElementById('btnGL');
const btnDX = document.getElementById('btnDX');
const exportBtn = document.getElementById('exportBtn');
const outputLabel = document.getElementById('outputLabel');
const exportFormat = document.getElementById('exportFormat');

let originalImage = null;
let currentFormat = 'GL'; // 'GL' or 'DX'

// --- Event Listeners ---

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragging');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleFile(file);
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

btnGL.addEventListener('click', () => {
    setFormat('GL');
});

btnDX.addEventListener('click', () => {
    setFormat('DX');
});

exportBtn.addEventListener('click', exportImage);

// --- Core Logic ---

function setFormat(format) {
    currentFormat = format;
    if (format === 'GL') {
        btnGL.classList.add('active');
        btnDX.classList.remove('active');
        outputLabel.textContent = 'Processed (OpenGL)';
    } else {
        btnDX.classList.add('active');
        btnGL.classList.remove('active');
        outputLabel.textContent = 'Processed (DirectX)';
    }
    if (originalImage) processImage();
}

function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            initCanvases(img);
            processImage();
            exportBtn.disabled = false;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function initCanvases(img) {
    canvasInput.width = img.width;
    canvasInput.height = img.height;
    canvasOutput.width = img.width;
    canvasOutput.height = img.height;

    const ctxIn = canvasInput.getContext('2d');
    ctxIn.drawImage(img, 0, 0);
}

function processImage() {
    if (!originalImage) return;

    const ctxIn = canvasInput.getContext('2d');
    const ctxOut = canvasOutput.getContext('2d');
    
    const imageData = ctxIn.getImageData(0, 0, canvasInput.width, canvasInput.height);
    const data = imageData.data;
    
    const outputData = ctxOut.createImageData(canvasInput.width, canvasInput.height);
    const out = outputData.data;

    const isDX = currentFormat === 'DX';

    for (let i = 0; i < data.length; i += 4) {
        // 1. Extract Channels
        // Unity Red Normals: R=A, G=B usually. 
        // User spec: X = Alpha, Y = Green, Z = 1.0
        const rawG = data[i + 1]; // Green
        const rawA = data[i + 3]; // Alpha

        // 2. Normalize to 0-1
        const nx = rawA / 255.0;
        const ny = rawG / 255.0;

        // 3. Unpack to -1, 1
        let vx = nx * 2.0 - 1.0;
        let vy = ny * 2.0 - 1.0;
        let vz = 1.0; // Constant Z as requested

        // 4. DirectX Flip (Y-)
        if (isDX) {
            vy = -vy;
        }

        // 5. Normalize Vector
        const length = Math.sqrt(vx * vx + vy * vy + vz * vz);
        vx /= length;
        vy /= length;
        vz /= length;

        // 6. Pack back to 0-255
        out[i]     = (vx * 0.5 + 0.5) * 255; // R
        out[i + 1] = (vy * 0.5 + 0.5) * 255; // G
        out[i + 2] = (vz * 0.5 + 0.5) * 255; // B
        out[i + 3] = 255; // Alpha (Full opaque)
    }

    ctxOut.putImageData(outputData, 0, 0);
}

function exportImage() {
    const format = exportFormat.value;
    const fileName = `Normal_${currentFormat}_${new Date().getTime()}.${format.toLowerCase()}`;

    if (format === 'PNG') {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = canvasOutput.toDataURL('image/png');
        link.click();
    } else if (format === 'TGA') {
        const tgaData = encodeTGA(canvasOutput);
        const blob = new Blob([tgaData], { type: 'image/x-tga' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

function encodeTGA(canvas) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;
    const width = canvas.width;
    const height = canvas.height;

    // TGA Header (18 bytes)
    const header = new Uint8Array(18);
    header[2] = 2; // Truecolor
    header[12] = width & 0xFF;
    header[13] = (width >> 8) & 0xFF;
    header[14] = height & 0xFF;
    header[15] = (height >> 8) & 0xFF;
    header[16] = 32; // Bits per pixel
    header[17] = 0x20; // Top-to-bottom

    const tgaData = new Uint8Array(18 + width * height * 4);
    tgaData.set(header);

    let offset = 18;
    for (let i = 0; i < pixels.length; i += 4) {
        // RGBA to BGRA (TGA standard)
        tgaData[offset++] = pixels[i + 2]; // B
        tgaData[offset++] = pixels[i + 1]; // G
        tgaData[offset++] = pixels[i];     // R
        tgaData[offset++] = pixels[i + 3]; // A
    }

    return tgaData;
}
