// Gera a DEMONSTRAÇÃO estática (sem servidor/banco) em demo/dist, pronta para GitHub Pages.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "demo", "dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const aliases = {
  "next/link": path.join(root, "demo/shims/link.tsx"),
  "next/navigation": path.join(root, "demo/shims/navigation.ts"),
  "@/lib/client/api": path.join(root, "demo/mock-api.ts"),
};

await build({
  entryPoints: [path.join(root, "demo/app.tsx")],
  bundle: true,
  format: "esm",
  minify: true,
  sourcemap: false,
  target: ["es2020"],
  outfile: path.join(out, "app.js"),
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
  plugins: [
    {
      name: "keylingo-demo-alias",
      setup(b) {
        b.onResolve({ filter: /^(next\/link|next\/navigation|@\/lib\/client\/api)$/ }, (a) => ({ path: aliases[a.path] }));
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: path.join(root, "src"), kind: a.kind }));
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: path.join(root, "tests/stubs/server-only.ts") }));
      },
    },
  ],
});

execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), ["-i", "demo/demo.css", "-o", path.join(out, "app.css"), "--minify"], { cwd: root, stdio: "inherit" });
copyFileSync(path.join(root, "demo/index.html"), path.join(out, "index.html"));
copyFileSync(path.join(root, "src/app/icon.svg"), path.join(out, "icon.svg"));
// Sem processamento Jekyll no GitHub Pages
copyFileSync(path.join(root, "demo/index.html"), path.join(out, "404.html"));
execFileSync("touch", [path.join(out, ".nojekyll")]);
console.log("✔ demonstração gerada em demo/dist");
