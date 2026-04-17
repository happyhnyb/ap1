"use strict";
exports.__esModule = true;
exports.Footer = void 0;
var link_1 = require("next/link");
var image_1 = require("next/image");
function Footer() {
    return (React.createElement("footer", { className: "footer" },
        React.createElement("div", { className: "container" },
            React.createElement("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32, marginBottom: 32 } },
                React.createElement("div", null,
                    React.createElement("div", { className: "logo", style: { marginBottom: 10 } },
                        React.createElement(image_1["default"], { src: "/logo.png", alt: "KYC", width: 36, height: 36, style: { borderRadius: '50%', filter: 'brightness(1.2)' } }),
                        React.createElement("span", { style: { fontFamily: 'Lora,serif', fontWeight: 700, fontSize: 15 } }, "Know Your Commodity")),
                    React.createElement("p", { style: { fontSize: 13, color: 'var(--dim)', lineHeight: 1.6, margin: 0 } }, "Global commodity intelligence platform. Real data, deep analysis, actionable insights.")),
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 12 } }, "Platform"),
                    React.createElement("div", { style: { display: 'grid', gap: 8 } }, [['/', 'Feed'], ['/search', 'Search'], ['/premium/predictor', 'Predictor'], ['/subscribe', 'Subscribe']].map(function (_a) {
                        var href = _a[0], label = _a[1];
                        return (React.createElement(link_1["default"], { key: href, href: href, style: { fontSize: 13, color: 'var(--muted)' } }, label));
                    }))),
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 12 } }, "Company"),
                    React.createElement("div", { style: { display: 'grid', gap: 8 } }, [['/about', 'About'], ['/contact', 'Contact']].map(function (_a) {
                        var href = _a[0], label = _a[1];
                        return (React.createElement(link_1["default"], { key: href, href: href, style: { fontSize: 13, color: 'var(--muted)' } }, label));
                    })))),
            React.createElement("div", { className: "divider" }),
            React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 20, flexWrap: 'wrap' } },
                React.createElement("span", { style: { fontSize: 13 } }, "\u00A9 2026 Know Your Commodity\u2122 \u00B7 All rights reserved"),
                React.createElement("span", { style: { fontSize: 12, color: 'var(--dim)' } }, "Data from Agmarknet \u00B7 Powered by Next.js 15 + MongoDB")))));
}
exports.Footer = Footer;
