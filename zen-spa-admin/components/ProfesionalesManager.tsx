"use client"

import { FormEvent, useState } from "react"
import { API_BASE, Profesional } from "@/lib/api"
import type { LocalDisponibilidad } from "@/components/LocalesDisponibilidadManager"

type ProfesionalForm = {
  nombre: string
  telefono: string
  email: string
  activo: boolean
  local_id: string
  dias_laborales: string[]
  hora_entrada: string
  hora_salida: string
  bloqueos_texto: string
}

const allDays = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]

function boolValue(value: boolean | number | undefined) {
  return value === true || value === 1
}

function timeValue(value?: string | null, fallback = "08:00") {
  return String(value || fallback).slice(0, 5)
}

function emptyForm(locales: LocalDisponibilidad[]): ProfesionalForm {
  return {
    nombre: "",
    telefono: "",
    email: "",
    activo: true,
    local_id: locales[0]?.id ? String(locales[0].id) : "",
    dias_laborales: allDays.filter((day) => day !== "Domingo"),
    hora_entrada: "08:00",
    hora_salida: "18:00",
    bloqueos_texto: "",
  }
}

function blocksToText(profesional: Profesional) {
  return (profesional.bloqueos_especificos || [])
    .map((block) => {
      const fecha = String(block.fecha || "").slice(0, 10)
      const inicio = block.hora_inicio ? timeValue(block.hora_inicio, "") : ""
      const fin = block.hora_fin ? timeValue(block.hora_fin, "") : ""
      const rango = inicio || fin ? " " + inicio + "-" + fin : ""
      return (fecha + rango + " " + (block.motivo || "")).trim()
    })
    .join("
")
}

function formFromProfesional(profesional: Profesional, locales: LocalDisponibilidad[]): ProfesionalForm {
  const horarios = profesional.horarios || []
  const firstAvailable = horarios.find((item) => boolValue(item.disponible)) || horarios[0]
  return {
    nombre: profesional.nombre || "",
    telefono: profesional.telefono || "",
    email: profesional.email || "",
    activo: profesional.activo !== false && profesional.activo !== 0,
    local_id: profesional.local_id ? String(profesional.local_id) : (locales[0]?.id ? String(locales[0].id) : ""),
    dias_laborales: horarios.length ? horarios.filter((item) => boolValue(item.disponible)).map((item) => item.dia) : allDays.filter((day) => day !== "Domingo"),
    hora_entrada: timeValue(firstAvailable?.hora_entrada, "08:00"),
    hora_salida: timeValue(firstAvailable?.hora_salida, "18:00"),
    bloqueos_texto: blocksToText(profesional),
  }
}

function parseBlocks(text: string) {
  return text.split("
").map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2})-(\d{2}:\d{2}))?(?:\s+(.*))?$/)
    if (!match) return null
    return { fecha: match[1], hora_inicio: match[2] || null, hora_fin: match[3] || null, motivo: match[4] || null }
  }).filter(Boolean)
}

export default function ProfesionalesManager({ initialProfesionales, initialLocales = [] }: { initialProfesionales: Profesional[], initialLocales?: LocalDisponibilidad[] }) {
  const [profesionales, setProfesionales] = useState(initialProfesionales)
  const [form, setForm] = useState<ProfesionalForm>(() => emptyForm(initialLocales))
  const [editId, setEditId] = useState<number | null>(null)
  const [editForms, setEditForms] = useState<Record<number, ProfesionalForm>>(() => Object.fromEntries(initialProfesionales.map((p) => [p.id, formFromProfesional(p, initialLocales)])))
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  function payloadFromForm(current: ProfesionalForm) {
    return {
      nombre: current.nombre.trim(),
      telefono: current.telefono.trim() || null,
      email: current.email.trim() || null,
      activo: current.activo,
      local_id: current.local_id ? Number(current.local_id) : null,
      dias_laborales: current.dias_laborales,
      hora_entrada: current.hora_entrada,
      hora_salida: current.hora_salida,
      bloqueos_especificos: parseBlocks(current.bloqueos_texto),
    }
  }

  function toggleDay(current: ProfesionalForm, setter: (next: ProfesionalForm) => void, day: string) {
    const exists = current.dias_laborales.includes(day)
    setter({ ...current, dias_laborales: exists ? current.dias_laborales.filter((item) => item !== day) : [...current.dias_laborales, day] })
  }

  async function crearProfesional(event: FormEvent) {
    event.preventDefault()
    if (!form.nombre.trim()) return
    setSaving(true)
    setError("")
    setMessage("")

    try {
      const response = await fetch(API_BASE + "/api/profesionales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(form)),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "No se pudo crear la profesional")

      setProfesionales((current) => [...current, data.data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setEditForms((current) => ({ ...current, [data.data.id]: formFromProfesional(data.data, initialLocales) }))
      setForm(emptyForm(initialLocales))
      setShowForm(false)
      setMessage(data.mensaje || "Profesional agregada correctamente")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la profesional")
    } finally {
      setSaving(false)
    }
  }

  async function guardarProfesional(profesional: Profesional) {
    const current = editForms[profesional.id]
    if (!current?.nombre.trim()) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch(API_BASE + "/api/profesionales/" + profesional.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(current)),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la profesional")
      setProfesionales((items) => items.map((item) => item.id === profesional.id ? data.data : item))
      setEditForms((items) => ({ ...items, [profesional.id]: formFromProfesional(data.data, initialLocales) }))
      setEditId(null)
      setMessage(data.mensaje || "Profesional actualizada correctamente")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la profesional")
    } finally {
      setSaving(false)
    }
  }

  async function eliminarProfesional(profesional: Profesional) {
    if (!window.confirm("Eliminar a " + profesional.nombre + " del equipo?")) return
    setError("")
    setMessage("")

    try {
      const response = await fetch(API_BASE + "/api/profesionales/" + profesional.id, { method: "DELETE" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar la profesional")

      setProfesionales((current) => current.filter((item) => item.id !== profesional.id))
      setMessage(data.mensaje || "Profesional eliminada correctamente")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la profesional")
    }
  }

  function renderFields(current: ProfesionalForm, setter: (next: ProfesionalForm) => void) {
    return (
      <>
        <label>Nombre<input required value={current.nombre} onChange={(event) => setter({ ...current, nombre: event.target.value })} /></label>
        <label>Telefono<input value={current.telefono} onChange={(event) => setter({ ...current, telefono: event.target.value })} /></label>
        <label>Email<input type="email" value={current.email} onChange={(event) => setter({ ...current, email: event.target.value })} /></label>
        <label>Local<select value={current.local_id} onChange={(event) => setter({ ...current, local_id: event.target.value })}>{initialLocales.map((local) => <option key={local.id} value={local.id}>{local.nombre}</option>)}</select></label>
        <label>Entrada<input type="time" value={current.hora_entrada} onChange={(event) => setter({ ...current, hora_entrada: event.target.value })} /></label>
        <label>Salida<input type="time" value={current.hora_salida} onChange={(event) => setter({ ...current, hora_salida: event.target.value })} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={current.activo} onChange={(event) => setter({ ...current, activo: event.target.checked })} /> Activa</label>
        <div style={{ gridColumn: "1 / -1" }}>
          <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: "12px" }}>Disponibilidad por dia</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {allDays.map((day) => <label key={day} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 8px", fontSize: "12px" }}><input type="checkbox" checked={current.dias_laborales.includes(day)} onChange={() => toggleDay(current, setter, day)} /> {day}</label>)}
          </div>
        </div>
        <label style={{ gridColumn: "1 / -1" }}>Bloqueos especificos<textarea rows={3} value={current.bloqueos_texto} onChange={(event) => setter({ ...current, bloqueos_texto: event.target.value })} placeholder="2026-07-10 14:00-16:00 Veterinaria" /></label>
      </>
    )
  }

  return (
    <section className="panel-card table-card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div><span>Equipo activo</span><h3>Profesionales ({profesionales.length})</h3></div>
        <button type="button" className="outline-button yellow" onClick={() => setShowForm((current) => !current)}>{showForm ? "Cancelar" : "+ Agregar profesional"}</button>
      </div>

      {showForm && <form className="form-grid professional-form" onSubmit={crearProfesional}>{renderFields(form, setForm)}<button className="new-turn-button" type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar profesional"}</button></form>}
      {message && <p className="tone-green">{message}</p>}
      {error && <p className="tone-red">{error}</p>}

      <table><thead><tr><th>Profesional</th><th>Telefono</th><th>Email</th><th>Local</th><th>Horario</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {profesionales.map((profesional) => {
          const editing = editId === profesional.id
          const current = editForms[profesional.id] || formFromProfesional(profesional, initialLocales)
          return <tr key={profesional.id}>
            {editing ? <td colSpan={7}><div className="form-grid professional-form">{renderFields(current, (next) => setEditForms((forms) => ({ ...forms, [profesional.id]: next })))}<div style={{ display: "flex", gap: 8 }}><button className="new-turn-button" type="button" disabled={saving} onClick={() => guardarProfesional(profesional)}>{saving ? "Guardando..." : "Guardar"}</button><button className="outline-button" type="button" onClick={() => { setEditForms((forms) => ({ ...forms, [profesional.id]: formFromProfesional(profesional, initialLocales) })); setEditId(null) }}>Cancelar</button></div></div></td> : <>
              <td style={{ fontWeight: 600 }}>{profesional.nombre}</td>
              <td>{profesional.telefono || "-"}</td>
              <td>{profesional.email || "-"}</td>
              <td>{profesional.local_nombre || "-"}</td>
              <td>{current.dias_laborales.join(", ")} · {current.hora_entrada} a {current.hora_salida}</td>
              <td><span className={current.activo ? "pill green" : "pill red"}>{current.activo ? "Activa" : "Inactiva"}</span></td>
              <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" className="outline-button" onClick={() => setEditId(profesional.id)}>Editar</button><button type="button" className="outline-button danger-button" onClick={() => eliminarProfesional(profesional)}>Eliminar</button></td>
            </>}
          </tr>
        })}
      </tbody></table>
    </section>
  )
}
