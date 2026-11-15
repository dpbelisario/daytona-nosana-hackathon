import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
export default {
  // The Daytona SDK is Node-only; keep it out of the bundler.
  serverExternalPackages: ["@daytona/sdk"],
  // The demo API uploads ../sandbox/* into each sandbox on every run.
  outputFileTracingRoot: path.join(here, ".."),
  outputFileTracingIncludes: { "/api/demo": ["../sandbox/*"] },
  // The landing page is the marketing site served from this origin. Any path
  // the factory does not own (fonts, /_ploy_static/_astro/*, images) falls
  // back to www.belli.ai, so assets are same-origin and hydration works.
  async rewrites() {
    return { fallback: [{ source: "/:path*", destination: "https://www.belli.ai/:path*" }] }
  },
}
