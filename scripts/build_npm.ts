import { build, emptyDir } from "https://deno.land/x/dnt@0.33.0/mod.ts";

await emptyDir("npm");

build({
  entryPoints: ["mod.ts"],
  outDir: "npm",
  package: {
    name: "range-reconcile",
    version: Deno.args[0],
  },
  shims: {
    deno: {
      test: "dev",
    },
  },
});
