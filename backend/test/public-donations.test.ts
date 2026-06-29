/**
 * Integración HTTP de las rutas públicas de donaciones (/api/donations).
 * Supertest contra el Postgres LOCAL, solo datos sintéticos. Verifica el POST
 * (registro de intención → { id, paypalUrl }), el GET (stats + recientes) y que
 * las donaciones recientes NUNCA expongan ip_hash / user_agent.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "./helpers";
import { expectNoSensitiveFields } from "./helpers";
import request from "supertest";

let app: import("express").Express;

beforeAll(async () => {
  app = (await import("@/server")).app;
});

function syntheticDonation() {
  return { name: "Donante Demo", amountCents: 1000 }; // USD 10 (sintético)
}

describe("POST /api/donations", () => {
  it("registra la intención y devuelve { id, paypalUrl }", async () => {
    const res = await request(app).post("/api/donations").send(syntheticDonation());
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
    expect(typeof res.body.paypalUrl).toBe("string");
    expect(res.body.paypalUrl).toMatch(/^https:\/\//);
    expectNoSensitiveFields(res.body);
  });

  it("rechaza un monto fuera de rango con 400 y mensaje visible", async () => {
    const res = await request(app)
      .post("/api/donations")
      .send({ name: "Donante Demo", amountCents: 1 }); // por debajo del mínimo
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  });
});

describe("GET /api/donations", () => {
  it("devuelve stats + recientes sin filtrar datos sensibles", async () => {
    await request(app).post("/api/donations").send(syntheticDonation());
    const res = await request(app).get("/api/donations");
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeTruthy();
    expect(Array.isArray(res.body.recent)).toBe(true);
    for (const d of res.body.recent) {
      expect(d).not.toHaveProperty("ipHash");
      expect(d).not.toHaveProperty("ip_hash");
      expect(d).not.toHaveProperty("userAgent");
    }
    expectNoSensitiveFields(res.body);
  });
});
