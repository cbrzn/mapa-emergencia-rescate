/**
 * Integración HTTP de las rutas PÚBLICAS de reportes (/api/reports). Levanta la
 * app real con supertest (sin abrir puerto) contra el Postgres LOCAL. Solo datos
 * sintéticos. Verifica contrato, status codes, errores visibles, límites de
 * tamaño y que la respuesta no filtre la columna `photo` cruda (solo `photoUrl`).
 *
 * Requiere el stack local (docker compose up) o los service containers del CI.
 * El rate-limit va deshabilitado aquí (helpers fija RATE_LIMIT_DISABLED=1); su
 * comportamiento se prueba aparte en public-rate-limit.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "./helpers";
import { expectNoSensitiveFields } from "./helpers";
import request from "supertest";

let app: import("express").Express;

beforeAll(async () => {
  app = (await import("@/server")).app;
});

// Marcador sintético sobre coordenadas demo (Caracas), sin foto ni datos reales.
function syntheticReport() {
  return {
    type: "critical",
    lat: 10.5,
    lng: -66.9,
    place: `Punto demo ${Math.trunc(performance.now())}`,
    affected: 3,
    needs: "Agua y alimentos (demo)",
  };
}

describe("POST /api/reports", () => {
  it("crea un reporte y devuelve 201 con el DTO (sin foto cruda)", async () => {
    const res = await request(app).post("/api/reports").send(syntheticReport());
    expect(res.status).toBe(201);
    expect(res.body.report).toMatchObject({
      type: "critical",
      lat: 10.5,
      lng: -66.9,
      confirmations: 0,
    });
    expect(res.body.report.id).toBeTruthy();
    // Allowlist: nunca exponemos la columna `photo`; solo `photoUrl` (aquí null).
    expect(res.body.report).not.toHaveProperty("photo");
    expect(res.body.report.photoUrl).toBeNull();
    expectNoSensitiveFields(res.body);
  });

  it("rechaza entrada inválida con 400 y mensaje visible", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ type: "no-existe", lat: 10, lng: -66, place: "x" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  it("rechaza una foto sobredimensionada (límite de tamaño)", async () => {
    const huge = "x".repeat(1_400_001); // > MAX_REPORT_PHOTO_CHARS
    const res = await request(app)
      .post("/api/reports")
      .send({ ...syntheticReport(), photo: huge });
    expect([400, 413]).toContain(res.status);
    expect(typeof res.body.error).toBe("string");
  });
});

describe("GET /api/reports", () => {
  it("lista DTOs sin cuerpos crudos ni fotos embebidas", async () => {
    await request(app).post("/api/reports").send(syntheticReport());
    const res = await request(app).get("/api/reports");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.reports)).toBe(true);
    for (const r of res.body.reports) {
      expect(r).not.toHaveProperty("photo");
      expect(r).toHaveProperty("photoUrl"); // URL derivada o null
    }
    expectNoSensitiveFields(res.body);
  });
});

describe("POST /api/reports/:id/confirm", () => {
  it("confirma una vez (200) y deduplica la segunda desde la misma IP (409)", async () => {
    const created = await request(app).post("/api/reports").send(syntheticReport());
    const id = created.body.report.id as string;

    const first = await request(app).post(`/api/reports/${id}/confirm`);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, confirmations: 1 });

    const second = await request(app).post(`/api/reports/${id}/confirm`);
    expect(second.status).toBe(409);
    expect(second.body.ok).toBe(false);
  });
});
