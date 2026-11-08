// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import admin from "firebase-admin";
import { getAdminFirestore, isAdminFirestoreConfigured } from "@/app/utils/platform/firebaseAdmin";

vi.mock("server-only", () => ({}));
vi.mock("firebase-admin", () => ({ default: {
  apps: [], initializeApp: vi.fn(), firestore: vi.fn(() => ({ kind: "test-db" })),
  credential: { cert: vi.fn(() => "test-credential") },
} }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FIREBASE_PROJECT_ID", "demo-bughouse");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "");
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
});
afterEach(() => vi.unstubAllEnvs());

it("uses a demo emulator without service account credentials", () => {
  getAdminFirestore();
  expect(admin.initializeApp).toHaveBeenCalledWith({ projectId: "demo-bughouse" });
  expect(admin.credential.cert).not.toHaveBeenCalled();
});

it("still requires credentials without an emulator", () => {
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
  expect(() => getAdminFirestore()).toThrow("Missing Firebase Admin env vars");
  expect(admin.initializeApp).not.toHaveBeenCalled();
});

it("does not waive credentials for a non-demo project", () => {
  vi.stubEnv("FIREBASE_PROJECT_ID", "production-example");
  expect(() => getAdminFirestore()).toThrow("Missing Firebase Admin env vars");
  expect(admin.initializeApp).not.toHaveBeenCalled();
});

it("reports sharing unavailable when credentials are missing", () => {
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
  expect(isAdminFirestoreConfigured()).toBe(false);
  expect(admin.initializeApp).not.toHaveBeenCalled();
});

it("accepts a demo emulator but rejects a real project without credentials", () => {
  expect(isAdminFirestoreConfigured()).toBe(true);
  vi.stubEnv("FIREBASE_PROJECT_ID", "production-example");
  expect(isAdminFirestoreConfigured()).toBe(false);
});

it("requires all three service account fields", () => {
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
  vi.stubEnv("FIREBASE_PROJECT_ID", "production-example");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "admin@example.iam.gserviceaccount.com");
  expect(isAdminFirestoreConfigured()).toBe(false);
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "test-private-key");
  expect(isAdminFirestoreConfigured()).toBe(true);
});
