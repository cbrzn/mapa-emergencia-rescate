/**
 * Integración HTTP del endpoint público de contacto (POST /api/contact).
 * Supertest contra el Postgres LOCAL, solo datos sintéticos. Verifica el
 * contrato { ok, id, message }, los errores visibles y que la respuesta NUNCA
 * devuelva el hash de IP que se persiste internamente.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "./helpers";
import { expectNoSensitiveFields } from "./helpers";
import request from "supertest";

let app: import("express").Express;

beforeAll(async () => {
  app = (await import("@/server")).app;
});

function syntheticMessage() {
  return {
    name: "Remitente Demo",
    email: "remitente@test.local",
    subject: "Asunto de prueba",
    message: "Mensaje sintético para el test de integración.",
  };
}

describe("POST /api/contact", () => {
  it("acepta un mensaje válido y devuelve { ok, id, message } sin filtrar ip_hash", async () => {
    const res = await request(app).post("/api/contact").send(syntheticMessage());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBeTruthy();
    expect(typeof res.body.message).toBe("string");
    // El email del remitente es el que ÉL envió; lo relevante es no devolver el
    // hash de IP ni el user-agent que se persisten en el servidor.
    expect(res.body).not.toHaveProperty("ipHash");
    expect(res.body).not.toHaveProperty("ip_hash");
    expect(res.body).not.toHaveProperty("userAgent");
    expectNoSensitiveFields(res.body, ["email"]);
  });

  it("rechaza un correo inválido con 400 y mensaje visible", async () => {
    const res = await request(app)
      .post("/api/contact")
      .send({ ...syntheticMessage(), email: "no-es-correo" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  it("rechaza un mensaje vacío con 400", async () => {
    const res = await request(app)
      .post("/api/contact")
      .send({ ...syntheticMessage(), message: "" });
    expect(res.status).toBe(400);
  });
});
