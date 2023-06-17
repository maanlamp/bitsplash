const DEFAULT_CANVAS_FONT_SIZE = 10;
const normalisePadding = (padding) => {
    if (!padding)
        return { top: 0, right: 0, bottom: 0, left: 0 };
    if (typeof padding === "number")
        return { top: padding, right: padding, bottom: padding, left: padding };
    const newPadding = {};
    if (padding.horizontal) {
        newPadding.left = newPadding.right = padding.horizontal;
    }
    if (padding.vertical) {
        newPadding.top = newPadding.bottom = padding.vertical;
    }
    if (padding.top) {
        newPadding.top = padding.top;
    }
    if (padding.right) {
        newPadding.right = padding.right;
    }
    if (padding.bottom) {
        newPadding.bottom = padding.bottom;
    }
    if (padding.left) {
        newPadding.left = padding.left;
    }
    return newPadding;
};
const getFontSize = (context) => {
    const fontSizeString = context.font.match(/(\d+)px/)?.[1];
    return fontSizeString ? Number(fontSizeString) : DEFAULT_CANVAS_FONT_SIZE;
};
export const measure = (context, renderable, constraints) => {
    if (typeof renderable === "string") {
        return measureText(context, renderable, constraints);
    }
    return measureWidget(context, renderable);
};
const measureText = (context, text, constraints) => {
    const lines = wrapText(context, text, constraints?.width);
    const width = lines.reduce((widest, line) => Math.max(context.measureText(line).width, widest), 0);
    const height = lines.length * getFontSize(context) + 3;
    return { width, height };
};
const measureWidget = (context, widget) => {
    const padding = normalisePadding(widget.padding);
    const direction = widget.direction ?? "row";
    let mainAxis = 0;
    let crossAxis = 0;
    if (widget.children) {
        for (const child of widget.children) {
            const bounds = measure(context, child);
            mainAxis += direction === "column" ? bounds.height : bounds.width;
            crossAxis = Math.max(crossAxis, direction === "column" ? bounds.width : bounds.height);
        }
    }
    return {
        width: padding.left +
            (direction === "column" ? crossAxis : mainAxis) +
            padding.right +
            (direction === "column"
                ? 0
                : (widget.gap ?? 0) * ((widget.children?.length ?? 1) - 1)),
        height: padding.top +
            (direction === "column" ? mainAxis : crossAxis) +
            padding.bottom +
            (direction === "column"
                ? (widget.gap ?? 0) * ((widget.children?.length ?? 1) - 1)
                : 0),
    };
};
export const render = (context, renderable, x, y) => {
    if (typeof renderable === "string") {
        return renderText(context, renderable, x, y);
    }
    renderWidget(context, renderable, x, y);
};
const renderText = (context, text, x, y, constraints) => {
    const lines = wrapText(context, text, constraints?.width);
    const fontSize = getFontSize(context);
    for (let i = 0; i < lines.length; i++) {
        context.fillText(lines[i], x, y + (i + 1) * fontSize - 2);
    }
};
const renderWidget = (context, widget, x, y) => {
    context.save();
    context.fillStyle = "rgba(255,255,255,.125)";
    context.strokeStyle = "rgba(255,255,255,.75)";
    const preferred = measure(context, widget);
    const size = {
        width: widget.width ?? preferred.width,
        height: widget.height ?? preferred.height,
    };
    context.fillRect(x, y, size.width, size.height);
    context.strokeRect(x, y, size.width, size.height);
    context.restore();
    context.save();
    if (widget.overflow === "hidden") {
        context.beginPath();
        context.rect(x, y, size.width, size.height);
        context.clip();
        context.closePath();
    }
    const padding = normalisePadding(widget.padding);
    const direction = widget.direction ?? "row";
    const scrollable = widget.overflow === "hidden" ? 1 : 0;
    let offset = 0;
    if (widget.children) {
        for (const child of widget.children) {
            render(context, child, x +
                (widget.scroll?.horizontal ?? 0) * scrollable +
                padding.left +
                (direction === "row" ? offset : 0), y +
                (widget.scroll?.vertical ?? 0) * scrollable +
                padding.top +
                (direction === "row" ? 0 : offset));
            const bounds = measure(context, child);
            offset +=
                (direction === "column" ? bounds.height : bounds.width) +
                    (widget.gap ?? 0);
        }
    }
    context.restore();
    if (widget.overflow === "hidden" && preferred.height > size.height) {
        const scrollScale = size.height / preferred.height;
        context.fillStyle = "white";
        context.fillRect(x + size.width - 8, 4 + y + scrollScale * -(widget.scroll?.vertical ?? 0), 4, -16 + scrollScale * size.height);
    }
    if (widget.overflow === "hidden" && preferred.width > size.width) {
        const scrollScale = size.width / preferred.width;
        context.fillStyle = "white";
        context.fillRect(4 + x + scrollScale * -(widget.scroll?.horizontal ?? 0), y + size.height - 8, -16 + scrollScale * size.width, 4);
    }
};
const wrapText = (context, text, maxWidth = Infinity) => {
    const words = text
        .split(/[\r\f\v\t ]+/)
        .flatMap(word => word.split(/(\n)/))
        .filter(Boolean);
    const spaceWidth = context.measureText(" ").width;
    const lines = [[]];
    let lineWidth = 0;
    for (const word of words) {
        if (word === "\n") {
            lines.push([]);
            lineWidth = 0;
            continue;
        }
        const { width } = context.measureText(word);
        lineWidth += width + spaceWidth * (lineWidth === 0 ? 0 : 1);
        if (lineWidth > maxWidth && lines[lines.length - 1].length !== 0) {
            lines.push([]);
            lineWidth = width;
        }
        lines[lines.length - 1].push(word);
    }
    return lines.map(line => line.join(" "));
};
//# sourceMappingURL=render.js.map