declare const saveAs: any;

// toBlob polyfill
if (!HTMLCanvasElement.prototype.toBlob) {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        value: function (callback, type, quality) {

            var binStr = atob( this.toDataURL(type, quality).split(',')[1] ),
                len = binStr.length,
                arr = new Uint8Array(len);

            for (var i=0; i<len; i++ ) {
                arr[i] = binStr.charCodeAt(i);
            }

            callback( new Blob( [arr], {type: type || 'image/png'} ) );
        }
    });
}

function allowDrop(ev: Event) {
    ev.preventDefault();
}

function loadImage(src: string, cb: (img: HTMLImageElement) => void) {
    const img = new Image();
    img.onload = () => cb(img);
    img.src = src;
}

let srcImg: HTMLImageElement = null;
let srcFileName: string = null;

function drop(ev) {
    ev.preventDefault();
    if (ev.dataTransfer.files.length == 0) {
        alert("You must drop a file!")
        return
    }
    if (ev.dataTransfer.files[0].type != "image/png") {
        alert("File type must be image/png")
        return
    }

    const file = ev.dataTransfer.files[0];
    loadImage(URL.createObjectURL(file), (newImg) => {
        if (srcImg != null) {
            URL.revokeObjectURL(srcImg.src);
        }

        srcImg = newImg;
        srcFileName = file.name;
        document.getElementById("dropper").textContent =
            `${file.name}: ${srcImg.width}x${srcImg.height}.`;
    });
}

const canvas = <HTMLCanvasElement>document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function sliceClicked() {
    if (srcImg == null) {
        alert("You must drop an image first")
        return false
    }

    slice(srcImg,
        (<HTMLInputElement>document.getElementById("insetLeft")).valueAsNumber,
        (<HTMLInputElement>document.getElementById("insetRight")).valueAsNumber,
        (<HTMLInputElement>document.getElementById("insetTop")).valueAsNumber,
        (<HTMLInputElement>document.getElementById("insetBottom")).valueAsNumber);
    return true;
}

function saveImage() {
    if (!sliceClicked()) {
        return;
    }

    (<any>canvas).toBlob((blob) => {
        saveAs(blob, srcFileName.replace(/\.png$/, ".9.png"));
    })
}

function slice(srcImg: HTMLImageElement,
               insetLeft: number, insetRight: number, insetTop: number, insetBottom: number)
{
    const dstWidth = insetLeft + insetRight;
    const dstHeight = insetTop + insetBottom;
    canvas.width = dstWidth;
    canvas.height = dstHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Top Left
    ctx.drawImage(srcImg,
        0, 0,
        insetLeft, insetTop,
        0, 0,
        insetLeft, insetTop);
    // Top Right
    ctx.drawImage(srcImg,
        srcImg.width - insetRight, 0,
        insetRight, insetTop,
        insetLeft, 0,
        insetRight, insetTop);
    // Bottom Left
    ctx.drawImage(srcImg,
        0, srcImg.height - insetBottom,
        insetLeft, insetBottom,
        0, insetTop,
        insetLeft, insetBottom);
    // Bottom Right
    ctx.drawImage(srcImg,
        srcImg.width - insetRight, srcImg.height - insetBottom,
        insetRight, insetBottom,
        insetLeft, insetTop,
        insetRight, insetBottom);


}