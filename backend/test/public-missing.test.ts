/**
 * Integración HTTP de las rutas PÚBLICAS de personas desaparecidas
 * (/api/missing). Supertest contra el Postgres LOCAL, solo datos sintéticos.
 * Verifica contrato, paginación, el endpoint de mapa y que la ficha pública no
 * filtre la columna `photo` cruda (expone `photoUrl`). `contact` SÍ es público
 * por diseño en esta ficha, así que se exceptúa de la aserción de no-filtrado.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "./helpers";
import { expectNoSensitiveFields } from "./helpers";
import request from "supertest";

let app: import("express").Express;

beforeAll(async () => {
  app = (await import("@/server")).app;
});

// Nombre único (>= MIN_SEARCH_LEN) → clave de cache fresca al buscarlo, sin
// chocar con el TTL del listado general. Persona sintética, sin datos reales.
function syntheticPerson() {
  const tag = `Zdemo${Math.trunc(performance.now())}`;
  return {
    name: `${tag} Persona Sintetica`,
    age: 30,
    nationality: "Venezolana",
    description: "Registro de prueba (demo)",
    lastSeen: "Plaza demo, Caracas",
    contact: "demo@test.local",
    reportType: "missing" as const,
    _tag: tag,
  };
}

describe("POST /api/missing", () => {
  it("crea un reporte y devuelve 201 con el DTO (sin foto cruda)", async () => {
    const person = syntheticPerson();
    const res = await request(app).post("/api/missing").send(person);
    expect(res.status).toBe(201);
    expect(res.body.person).toMatchObject({ name: person.name, status: "active" });
    expect(res.body.person.id).toBeTruthy();
    expect(res.body.person).not.toHaveProperty("photo");
    expect(res.body.person).toHaveProperty("photoUrl");
    // `contact` es público en la ficha; el resto de campos sensibles no.
    expectNoSensitiveFields(res.body, ["email"]);
  });

  it("rechaza un reporte sin nombre con 400 y mensaje visible", async () => {
    const res = await request(app).post("/api/missing").send({ name: "" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });
});

describe("GET /api/missing", () => {
  it("devuelve una página de DTOs y encuentra al recién creado por búsqueda", async () => {
    const person = syntheticPerson();
    await request(app).post("/api/missing").send(person);

    const res = await request(app).get("/api/missing").query({ q: person._tag });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.people)).toBe(true);
    expect(res.body).toMatchObject({ page: 1, persistent: true });
    expect(typeof res.body.total).toBe("number");

    const found = res.body.people.find((p: { name: string }) => p.name === person.name);
    expect(found).toBeTruthy();
    expect(found).not.toHaveProperty("photo");
    for (const p of res.body.people) expect(p).toHaveProperty("photoUrl");
    expectNoSensitiveFields(res.body, ["email"]);
  });
});

describe("GET /api/missing/map", () => {
  it("devuelve marcadores ligeros sin cuerpos crudos", async () => {
    const res = await request(app).get("/api/missing/map");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.markers)).toBe(true);
    for (const m of res.body.markers) {
      expect(m).not.toHaveProperty("photo");
      expect(m).not.toHaveProperty("contact"); // el marcador del mapa ni siquiera lo trae
    }
    expectNoSensitiveFields(res.body);
  });
});
