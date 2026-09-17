import path from "node:path";

Object.defineProperty(process, "resourcesPath", {
  configurable: true,
  value: path.resolve(process.cwd(), "test-fixtures", "legacy-resources")
});
