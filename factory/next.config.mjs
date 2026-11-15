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
}
