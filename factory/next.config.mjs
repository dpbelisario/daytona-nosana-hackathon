/** @type {import('next').NextConfig} */
export default {
  // The Daytona SDK is Node-only; keep it out of the bundler.
  serverExternalPackages: ["@daytona/sdk"],
}
