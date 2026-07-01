"use client"

import { FormEvent, useMemo, useState } from "react"
import { API_BASE } from "@/lib/api"

export type LocalHorario = {
  id?: number
  local_id?: number
  dia: string
  hora_apertura?: string
  hora_cierre?: string
  disponible?: boolean | number
}

export type LocalDisponibilidad = {
  id: number
  nombre: string
  direccion?: string | null
  tipo?: string | null
  activo?: boolean | number
  horarios?: LocalHorario[]
}

type LocalForm = {
  direccion: string
  activo: boolean
  dias_laborales: string[]
  hora_apertura: string
  hora_cierre: string
}

const allDays = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]

function boolValue(value: boolean | number | undefined) {
  return value === true || value === 1
}

function timeValue(value?: string | null, fallback = "08:00") {
  return String(value || fallback).slice(0, 5)
}

function formFromLocal(local: LocalDisponibilidad): LocalForm {
  const horarios = local.horarios || []
  const firstAvailable = horarios.find((item) => boolValue(item.disponible)) || horarios[0]
  return {
    direccion: local.direccion || local.nombre,
    activo: local.activo !== false && local.activo !== 0,
    dias_laborales: horarios.length
      ? horarios.filter((item) => boolValue(item.disponible)).map((item) => item.dia)
      : allDays.filter((day) => day !== "Domingo"),
    hora_apertura: timeValue(firstAvailable?.hora_apertura, "08:00"),
    hora_cierre: timeValue(firstAvailable?.hora_cierre, "18:00"),
  }
}

function fallbackLocales(): LocalDisponibilidad[] {
  return [
    { id: 1, nombre: "Villaguay al 1000", direccion: "Villaguay al 1000", tipo: "Peluqueria / Spa", activo: true },
    { id: 2, nombre: "Juan Baez al final", direccion: "Juan Baez al final", tipo: "Guarderia", activo: true },
  ]
}

export default function LocalesDisponibilidadManager({ initialLocales }: { initialLocales: LocalDisponibilidad[] }) {
  const [locales, setLocales] = useState<LocalDisponibilidad[]>(initialLocales.length ? initialLocales : fallbackLocales())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [forms, setForms] = useState<Record<number, LocalForm>>(() => {
    const source = initialLocales.length ? initialLocales : fallbackLocales()
    return Object.fromEntries(source.map((local) => [local.id, formFromLocal(local)]))
  })
  const [savingId, setSavingId] = useState<number | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const totalActivos = useMemo(() => locales.filter((local) => local.activo !== false && local.activo !== 0).length, [locales])

  function updateForm(id: number, patch: Partial<LocalForm>) {
    setForms((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  function toggleDay(id: number, day: string) {
    const form = forms[id]
    const exists = form.dias_laborales.includes(day)
    updateForm(id, { dias_laborales: exists ? form.dias_laborales.filter((item) => item !== day) : [...form.dias_laborales, day] })
  }

  function cancelEdit(local: LocalDisponibilidad) {
    setForms((current) => ({ ...current, [local.id]: formFromLocal(local) }))
    setEditingId(null)
    setError("")
  }

  async function saveLocal(event: FormEvent, local: LocalDisponibilidad) {
    event.preventDefault()
    const form = forms[local.id]
    setSavingId(local.id)
    setError("")
    setMessage("")
    try {
      const response = await fetch(API_BASE + "/api/disponibilidad/locales/" + local.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el local")
      setLocales((current) => current.map((item) => item.id === local.id ? data.data : item))
      setForms((current) => ({ ...current, [local.id]: formFromLocal(data.data) }))
      setEditingId(null)
      setMessage(data.mensaje || "Local actualizado correctamente")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el local")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="panel-card" style={{ marginBottom: "18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "14px", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: "0 0 4px", color: "var(--muted)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Locales</p>
          <h2 style={{ margin: 0, fontSize: "20px" }}>Horarios disponibles por local</h2>
        </div>
        <span style={{ color: "#86efac", fontSize: "12px", fontWeight: 700 }}>{totalActivos} locales activos para reservas web</span>
      </div>

      {message && <p className="tone-green">{message}</p>}
      {error && <p className="tone-red">{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
        {locales.map((local) => {
          const form = forms[local.id] || formFromLocal(local)
          const editing = editingId === local.id
          const noLaborales = allDays.filter((day) => !form.dias_laborales.includes(day)).join(", ") || "-"
          return (
            <article key={local.id} style={{ border: "1px solid rgba(167,139,250,0.22)", borderRadius: "8px", padding: "14px", background: "rgba(15,23,42,0.42)" }}>
              <form onSubmit={(event) => saveLocal(event, local)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "10px" }}>
                  <div>
                    <strong style={{ fontSize: "15px" }}>{local.nombre}</strong>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "13px" }}>{local.tipo || "Local"}</p>
                  </div>
                  <span className={form.activo ? "pill green" : "pill red"}>{form.activo ? "Activo" : "Inactivo"}</span>
                </div>

                {editing ? (
                  <div style={{ display: "grid", gap: "10px" }}>
                    <label>Direccion<input value={form.direccion} onChange={(event) => updateForm(local.id, { direccion: event.target.value })} /></label>
                    <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <label>Apertura<input type="time" value={form.hora_apertura} onChange={(event) => updateForm(local.id, { hora_apertura: event.target.value })} /></label>
                      <label>Cierre<input type="time" value={form.hora_cierre} onChange={(event) => updateForm(local.id, { hora_cierre: event.target.value })} /></label>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.activo} onChange={(event) => updateForm(local.id, { activo: event.target.checked })} /> Local activo</label>
                    <div>
                      <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: "12px" }}>Dias laborales</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {allDays.map((day) => (
                          <label key={day} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 8px", fontSize: "12px" }}>
                            <input type="checkbox" checked={form.dias_laborales.includes(day)} onChange={() => toggleDay(local.id, day)} /> {day}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="new-turn-button" type="submit" disabled={savingId === local.id}>{savingId === local.id ? "Guardando..." : "Guardar"}</button>
                      <button className="outline-button" type="button" onClick={() => cancelEdit(local)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "8px", fontSize: "13px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}><span style={{ color: "var(--muted)" }}>Direccion</span><strong style={{ textAlign: "right" }}>{form.direccion}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}><span style={{ color: "var(--muted)" }}>Dias laborales</span><strong style={{ textAlign: "right" }}>{form.dias_laborales.join(", ")}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}><span style={{ color: "var(--muted)" }}>Dia no laboral</span><strong style={{ textAlign: "right" }}>{noLaborales}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}><span style={{ color: "var(--muted)" }}>Horario</span><strong style={{ textAlign: "right" }}>{form.hora_apertura} a {form.hora_cierre}</strong></div>
                    <button className="outline-button" type="button" onClick={() => setEditingId(local.id)}>Editar</button>
                  </div>
                )}
              </form>
            </article>
          )
        })}
      </div>
    </section>
  )
}
