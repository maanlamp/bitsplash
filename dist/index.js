import { canvas } from "./canvas.js";
import { measure, render } from "./render.js";
const lendir = (len, rad) => [len * Math.cos(rad), len * Math.sin(rad)];
const viewport = canvas();
const resize = () => {
    viewport.canvas.width = window.innerWidth;
    viewport.canvas.height = window.innerHeight;
};
window.addEventListener("resize", resize);
resize();
const doc = {
    id: self.crypto.randomUUID(),
    overflow: "hidden",
    padding: 16,
    gap: 8,
    height: 400,
    width: 400,
    direction: "column",
    children: [
        "FFf1|()test 123\nwaho|o\nding|ong wahasd",
        {
            padding: 8,
            children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
        },
        {
            padding: 8,
            children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
        },
        {
            padding: 16,
            gap: 8,
            direction: "row",
            children: [
                "FFf1|()test 123\nwaho|o\nding|ong wahasd",
                {
                    padding: 8,
                    children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
                },
                {
                    padding: 8,
                    children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
                },
                {
                    padding: 8,
                    children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
                },
                {
                    padding: 8,
                    children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
                },
            ],
        },
        {
            padding: 8,
            children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
        },
        {
            padding: 8,
            children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
        },
    ],
    update: () => {
        const preferred = measure(viewport, doc);
        const difference = {
            height: doc.height - preferred.height,
            width: doc.width - preferred.width,
        };
        (doc.scroll ??= {}).vertical =
            ((Math.sin(tick / 25) + 1) / 2) * difference.height;
        (doc.scroll ??= {}).horizontal =
            ((Math.cos(tick / 50) + 1) / 2) * difference.width;
    },
    render: () => render(viewport, doc, 100, 100),
};
const entities = [doc];
const TICKS_PER_SECOND = 120;
const MS_PER_TICK = 1000 / TICKS_PER_SECOND;
let fps = 0;
let start = performance.now();
let lag = 0;
let delta = 0;
let tick = -1;
const gameloop = () => {
    requestAnimationFrame(gameloop);
    const now = performance.now();
    delta = now - start;
    start = now;
    lag += delta;
    while (lag >= MS_PER_TICK) {
        tick++;
        for (const entity of entities)
            entity.update?.();
        lag -= MS_PER_TICK;
    }
    viewport.font = "15px DM Mono";
    viewport.fillStyle = "black";
    viewport.fillRect(0, 0, viewport.canvas.width, viewport.canvas.height);
    const sizeString = viewport.canvas.width + " × " + viewport.canvas.height;
    viewport.fillStyle = "white";
    viewport.fillText("Δt " + delta.toFixed(2) + " ~ " + lag.toFixed(2), 3, 15);
    viewport.fillText(tick.toString(), 3, 31);
    viewport.fillText(Math.round(fps) + " fps", 3, 46);
    viewport.fillText(sizeString, viewport.canvas.width - viewport.measureText(sizeString).width - 3, 15);
    for (const entity of entities) {
        if (entity.render) {
            viewport.save();
            entity.render(viewport, lag / MS_PER_TICK);
            viewport.restore();
        }
    }
};
document.body.append(viewport.canvas);
gameloop();
setInterval(() => {
    fps = 1000 / delta;
}, 1000);
//# sourceMappingURL=index.js.map