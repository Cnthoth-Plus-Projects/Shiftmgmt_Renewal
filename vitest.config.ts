import path from "node:path";
import { defineConfig } from "vitest/config";

// 1-1 시점의 테스트는 서버(Node)뿐이라 environment 는 node 다.
// Phase 3 에서 화면 테스트가 생기면 src/web 만 jsdom 으로 나눈다.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared")
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000
  }
});
