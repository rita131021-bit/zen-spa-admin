"use client"

import { useState } from "react"
import { API_BASE, Servicio } from "@/lib/api"

const fallbackServices: Servicio[] = [
  { id: 1, nombre: "Spa Armonia", categoria: "Peluqueria", precio: 18000, duracion_minutos: 45, descripcion: "Bano + Corte de unas", activo: true },
  { id: 2, nombre: "Guarderia Canina", categoria: "Guarderia", precio: 12000, duracion_minutos: 480, descripcion: "Por dia", activo: true, requiere_canil: true },
  { id: 3, nombre: "Sesion Premium", categoria: "Peluqueria", precio: 85000, duracion_minutos: 120, descripcion: "Bano & Corte", activo: true },
]

export default function ServicePriceManager({ initialServices = fallbackServices }: { initialServices?: Servicio[] }) {
  const [services, setServices] = useState<Servicio[]>(initialServices)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [message, setMessage] = useState("")
  const [pricePassword, setPricePassword] = useState("")
  const priceUnlocked = pricePassword.trim() === "admin1234"
  const passwordStarted = pricePassword.trim().length > 0

  function updateLocal(id: number, field: keyof Servicio, value: string | boolean) {
    setServices((current) => current.map((service) => service.id === id ? { ...service, [field]: value } : service))
  }

  async function save(service: Servicio) {
    if (!priceUnlocked) {
      setMessage("Contraseña incorrecta. Ingresá admin1234 para modificar precios")
      return
    }
    setSavingId(service.id)
    setMessage("")
    try {
      const response = await fetch(`${API_BASE}/api/servicios/${service.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: service.nombre,
          categoria: service.categoria,
          precio: Number(service.precio),
          duracion_minutos: Number(service.duracion_minutos || 0),
          descripcion: service.descripcion,
          activo: Boolean(service.activo),
          password_precio: pricePassword.trim(),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar")
      setMessage("Precio actualizado correctamente")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo guardar el cambio")
    } finally {
      setSavingId(null)
    }
  }

  async function applyIncrease(percent: number) {
    if (!priceUnlocked) {
      setMessage("Contraseña incorrecta. Ingresá admin1234 para modificar precios")
      return
    }
    setMessage("")
    try {
      const response = await fetch(`${API_BASE}/api/servicios/precio/aumento`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ porcentaje: percent, password_precio: pricePassword.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "No se pudo aplicar")
      setServices((current) => current.map((service) => ({
        ...service,
        precio: Math.round(Number(service.precio || 0) * (1 + percent / 100)),
      })))
      setMessage(`Aumento de ${percent}% aplicado`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo aplicar el aumento")
    }
  }

  return (
    <>
      <section className="promo-grid">
        <article className="panel-card">
          <h3>Candado de precios</h3>
          <p>Los precios quedan bloqueados hasta ingresar la contraseña.</p>
          <label style={{ display: "grid", gap: 6, margin: "10px 0" }}>
            Contraseña para modificar precios
            <input
              type="password"
              value={pricePassword}
              onChange={(event) => setPricePassword(event.target.value)}
              placeholder="Ingresá admin1234"
            />
          </label>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid rgba(167,139,250,0.25)", borderRadius: 999, padding: "6px 10px", marginBottom: 10, fontSize: 12, fontWeight: 800, color: priceUnlocked ? "#86efac" : "#fca5a5" }}>
            <span>{priceUnlocked ? "Desbloqueado" : "Bloqueado"}</span>
            {!priceUnlocked && passwordStarted && <span>Contraseña incorrecta</span>}
          </div>
          <h3>Aplicar aumento general</h3>
          <p>Actualiza todos los precios de los servicios activos.</p>
          <div className="button-row">
            {[5, 10, 15, 20, 25].map((percent) => (
              <button className={percent === 10 ? "outline-button yellow" : "outline-button"} key={percent} disabled={!priceUnlocked} onClick={() => applyIncrease(percent)}>
                +{percent}%
              </button>
            ))}
          </div>
          {message && <p className="tone-purple">{message}</p>}
        </article>
        <article className="panel-card suggestion-card">
          <h3>Sugerencia</h3>
          <p>Guarderia no se actualiza hace 62 dias.</p>
          <button className="link-button">Ver detalles</button>
        </article>
      </section>

      <section className="panel-card table-card">
        <div className="card-head">
          <h3>Categorias</h3>
          <span className={priceUnlocked ? "pill green" : "pill red"}>{priceUnlocked ? "Precios desbloqueados" : "Precios bloqueados"}</span>
          <input className="small-search" placeholder="Buscar servicio..." />
        </div>
        <table>
          <thead>
            <tr><th>Servicio</th><th>Categoria</th><th>Precio actual</th><th>Duracion</th><th>Estado</th><th>Accion</th></tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id}>
                <td>{service.nombre}</td>
                <td>{service.categoria}</td>
                <td>
                  <input
                    className="price-input"
                    value={String(service.precio ?? "")}
                    disabled={!priceUnlocked}
                    title={priceUnlocked ? "Precio editable" : "Ingresá admin1234 para desbloquear"}
                    onChange={(event) => updateLocal(service.id, "precio", event.target.value)}
                  />
                </td>
                <td>{service.duracion_minutos} min</td>
                <td><span className={service.activo ? "pill green" : "pill red"}>{service.activo ? "Activo" : "Inactivo"}</span></td>
                <td><button className="outline-button" disabled={!priceUnlocked || savingId === service.id} onClick={() => save(service)}>{savingId === service.id ? "Guardando" : priceUnlocked ? "Guardar" : "Bloqueado"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
