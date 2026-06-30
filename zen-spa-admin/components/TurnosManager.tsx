"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { API_BASE, Cliente, DisponibilidadSlot, Mascota, Profesional, Servicio, Turno } from "@/lib/api"

type TurnosManagerProps = {
  initialTurnos?: Turno[]
}

const emptyForm = {
  cliente_id: "",
  mascota_id: "",
  servicio_id: "",
  profesional_id: "",
  fecha: "",
  hora: "",
  fecha_egreso: "",
  hora_egreso: "",
  observaciones: "",
}

function estadoPill(estado: string) {
  const map: Record<string, string> = {
    Pendiente: "pill yellow",
    Confirmado: "pill green",
    Completado: "pill blue",
    Cancelado: "pill gray",
  }
  return map[estado] || "pill gray"
}

function servicioSolicitado(observaciones?: string | null) {
  const match = String(observaciones || "").match(/Servicio solicitado:\s*([^|]+)/i)
  return match?.[1]?.trim() || ""
}

function servicioVisible(turno: Turno) {
  return servicioSolicitado(turno.observaciones) || turno.servicio_nombre || "Sin servicio"
}

function limpiarTelefono(value?: string | null) {
  return String(value || "").replace(/\D/g, "")
}

function mensajeWhatsAppTurno(turno: Turno, tipo: "confirmacion" | "reprogramacion" = "confirmacion") {
  const fecha = String(turno.fecha || "").slice(0, 10)
  const hora = String(turno.hora || "").slice(0, 5)
  const servicio = servicioVisible(turno)
  const encabezado = tipo === "reprogramacion" ? "Reprogramación de turno" : "Confirmación de turno"
  return [
    `Hola ${turno.cliente_nombre || ""}. ${encabezado} de Zen Spa para Mascotas:`,
    `Cliente: ${turno.cliente_nombre || "-"}`,
    `Mascota: ${turno.mascota_nombre || "-"}`,
    `Servicio: ${servicio}`,
    `Fecha: ${fecha || "-"}`,
    `Hora: ${hora || "-"}`,
    `Estado: ${turno.estado || "-"}`,
    `Pago: ${turno.pago || "Pendiente"}`,
    tipo === "reprogramacion"
      ? "Te escribimos para revisar/reprogramar este turno. ¿Nos confirmás disponibilidad?"
      : "Te escribimos para confirmar este turno. ¿Nos confirmás si está todo correcto?",
  ].join("\n")
}

function whatsappTurnoUrl(turno: Turno, tipo: "confirmacion" | "reprogramacion" = "confirmacion") {
  const turnoConWhatsapp = turno as Turno & { cliente_whatsapp?: string | null }
  const telefono = limpiarTelefono(turnoConWhatsapp.cliente_whatsapp)
  if (!telefono) return ""
  return `https://wa.me/${telefono}?text=${encodeURIComponent(mensajeWhatsAppTurno(turno, tipo))}`
}

function whatsappEnviado(turno: Turno) {
  return /WhatsApp enviado:/i.test(String(turno.observaciones || ""))
}

function agregarMarcaWhatsApp(observaciones?: string | null) {
  const actual = String(observaciones || "")
  if (/WhatsApp enviado:/i.test(actual)) return actual
  return `${actual}${actual ? " | " : ""}WhatsApp enviado: ${new Date().toISOString()}`
}

export default function TurnosManager({ initialTurnos = [] }: TurnosManagerProps) {
  const searchParams = useSearchParams()
  const [turnos, setTurnos] = useState<Turno[]>(initialTurnos)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [mascotas, setMascotas] = useState<Mascota[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(!initialTurnos.length)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [slots, setSlots] = useState<DisponibilidadSlot[]>([])
  const [slotHint, setSlotHint] = useState("")
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null)
  const [descuentoInfo, setDescuentoInfo] = useState<{ porcentaje: number; nombre: string } | null>(null)

  // Modal postergar
  const [postergando, setPostergando] = useState<Turno | null>(null)
  const [nuevaFecha, setNuevaFecha] = useState("")
  const [nuevaHora, setNuevaHora] = useState("")
  const [motivoAccion, setMotivoAccion] = useState("")

  // Filtro tabla
  const [filtroEstado, setFiltroEstado] = useState("todos")
  const [busqueda, setBusqueda] = useState("")

  const selectedServicio = servicios.find((s) => String(s.id) === form.servicio_id)
  const esGuarderia = selectedServicio?.categoria === 'guarderia' || 
    selectedServicio?.nombre?.toLowerCase().includes('guarderia') ||
    selectedServicio?.nombre?.toLowerCase().includes('guardería')
  const mascotasFiltradas = useMemo(
    () => mascotas.filter((m) => String(m.cliente_id) === form.cliente_id),
    [mascotas, form.cliente_id]
  )

  useEffect(() => {
    const fecha = searchParams.get("fecha")
    const hora = searchParams.get("hora")
    const buscar = searchParams.get("buscar")
    if (fecha || hora) {
      setForm((current) => ({
        ...current,
        fecha: fecha || current.fecha,
        hora: hora || current.hora,
      }))
    }
    if (buscar) setBusqueda(buscar)
  }, [searchParams])

  useEffect(() => {
    if (form.cliente_id && !form.mascota_id && mascotasFiltradas.length === 1) {
      updateField("mascota_id", String(mascotasFiltradas[0].id))
    }
  }, [form.cliente_id, form.mascota_id, mascotasFiltradas])

  const turnosFiltrados = useMemo(() => {
    return turnos.filter((t) => {
      const matchEstado = filtroEstado === "todos" || t.estado === filtroEstado
      const q = busqueda.toLowerCase()
      const matchBusqueda = !q ||
        String(t.cliente_nombre || "").toLowerCase().includes(q) ||
        String(t.mascota_nombre || "").toLowerCase().includes(q) ||
        servicioVisible(t).toLowerCase().includes(q) ||
        String(t.observaciones || "").toLowerCase().includes(q)
      return matchEstado && matchBusqueda
    })
  }, [turnos, filtroEstado, busqueda])

  async function loadCatalogs() {
    const [turnosRes, clientesRes, mascotasRes, serviciosRes, profesionalesRes] = await Promise.all([
      fetch(`${API_BASE}/api/turnos`, { cache: "no-store" }),
      fetch(`${API_BASE}/api/clientes`, { cache: "no-store" }),
      fetch(`${API_BASE}/api/mascotas`, { cache: "no-store" }),
      fetch(`${API_BASE}/api/servicios`, { cache: "no-store" }),
      fetch(`${API_BASE}/api/profesionales`, { cache: "no-store" }),
    ])
    if (turnosRes.ok) {
      const data = await turnosRes.json()
      const ordenados = Array.isArray(data) ? [...data].sort((a, b) => {
        const aTime = new Date(a.creado_en || a.fecha || 0).getTime()
        const bTime = new Date(b.creado_en || b.fecha || 0).getTime()
        return bTime - aTime
      }) : []
      setTurnos(ordenados)
    }
    if (clientesRes.ok) setClientes(await clientesRes.json())
    if (mascotasRes.ok) setMascotas(await mascotasRes.json())
    if (serviciosRes.ok) setServicios(await serviciosRes.json())
    if (profesionalesRes.ok) {
      const list: Profesional[] = await profesionalesRes.json()
      setProfesionales(list)
      const romina = list.find((p) => p.nombre?.toLowerCase().includes("romina"))
      if (romina && !form.profesional_id) {
        setForm((c) => ({ ...c, profesional_id: String(romina.id) }))
      }
    }
    setLoading(false)
  }

  useEffect(() => { loadCatalogs() }, [])

  // Disponibilidad al cambiar fecha
  useEffect(() => {
    if (!form.fecha) { setSlots([]); setSlotHint(""); return }
    const params = new URLSearchParams({ fecha: form.fecha })
    if (form.profesional_id) params.set("profesional_id", form.profesional_id)
    fetch(`${API_BASE}/api/disponibilidad?${params}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.slots) return
        setSlots(data.slots)
        const libres = data.slots.filter((s: DisponibilidadSlot) => s.disponible).length
        if (data.bloqueada) setSlotHint("⛔ Fecha bloqueada: no se pueden crear turnos.")
        else if (data.noLaborable) setSlotHint("🗓️ Feriado no laborable.")
        else setSlotHint(`✅ ${libres} horario(s) disponible(s)`)
      })
      .catch(() => setSlotHint(""))
  }, [form.fecha, form.profesional_id])

  // Descuento automático al seleccionar cliente
  useEffect(() => {
    if (!form.cliente_id) { setDescuentoInfo(null); return }
    fetch(`${API_BASE}/api/descuentos/cliente/${form.cliente_id}`, { method: "POST" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.porcentaje > 0) {
          setDescuentoInfo({ porcentaje: data.porcentaje, nombre: data.descuento_aplicable?.nombre || "" })
        } else {
          setDescuentoInfo(null)
        }
      })
      .catch(() => setDescuentoInfo(null))
  }, [form.cliente_id])

  function updateField(field: keyof typeof emptyForm, value: string) {
    setForm((c) => {
      const next = { ...c, [field]: value }
      if (field === "cliente_id") next.mascota_id = ""
      return next
    })
  }

  function setQuickDate(daysFromToday: number) {
    const date = new Date()
    date.setDate(date.getDate() + daysFromToday)
    updateField("fecha", date.toISOString().slice(0, 10))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(""); setError("")
    if (!form.cliente_id || !form.mascota_id || !form.servicio_id || !form.fecha || !form.hora) {
      setError("Completá cliente, mascota, servicio, fecha y hora.")
      setSaving(false); return
    }
    try {
      const body: Record<string, unknown> = {
        cliente_id: Number(form.cliente_id),
        mascota_id: Number(form.mascota_id),
        servicio_id: Number(form.servicio_id),
        profesional_id: form.profesional_id ? Number(form.profesional_id) : null,
        fecha: form.fecha,
        hora: form.hora,
        fecha_egreso: form.fecha_egreso || null,
        hora_egreso: form.hora_egreso || null,
        observaciones: form.observaciones || null,
      }
      const response = await fetch(`${API_BASE}/api/turnos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const razones = Array.isArray(data.razones) ? data.razones.join(". ") : ""
        setError(`${data.error || "No se pudo crear el turno"}${razones ? ` (${razones})` : ""}`)
        setSaving(false); return
      }
      setMessage("✅ Turno creado correctamente")
      if (data.whatsapp_url) setWhatsappUrl(data.whatsapp_url)
      setForm((c) => ({ ...emptyForm, profesional_id: c.profesional_id }))
      await loadCatalogs()
    } catch {
      setError("No se pudo conectar con el backend.")
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelar(turno: Turno) {
    if (!confirm(`¿Cancelar turno de ${turno.mascota_nombre || ""}?`)) return
    const motivo = prompt("Motivo de cancelación (opcional):") || "Cancelado por administrador"
    const res = await fetch(`${API_BASE}/api/turnos/${turno.id}/cancelar`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    })
    if (res.ok) { await loadCatalogs() }
    else { alert("No se pudo cancelar el turno") }
  }

  async function handleEliminarTurno(turno: Turno) {
    const ok = confirm(`¿Eliminar definitivamente la reserva de ${turno.cliente_nombre || "cliente"} para ${turno.mascota_nombre || "mascota"}?`)
    if (!ok) return
    const res = await fetch(`${API_BASE}/api/turnos/${turno.id}`, { method: "DELETE" })
    if (res.ok) { await loadCatalogs() }
    else { alert("No se pudo eliminar el turno") }
  }

  async function marcarWhatsAppEnviado(turno: Turno) {
    if (whatsappEnviado(turno)) return
    setTurnos((actuales) => actuales.map((item) => item.id === turno.id ? {
      ...item,
      observaciones: agregarMarcaWhatsApp(item.observaciones),
    } : item))
    try {
      const res = await fetch(`${API_BASE}/api/turnos/${turno.id}/whatsapp-enviado`, { method: "PATCH" })
      if (!res.ok) await loadCatalogs()
    } catch {
      await loadCatalogs()
    }
  }

  async function handlePosterguar() {
    if (!postergando || !nuevaFecha || !nuevaHora) { alert("Fecha y hora son obligatorias"); return }
    const res = await fetch(`${API_BASE}/api/turnos/${postergando.id}/postergar`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha: nuevaFecha, hora: nuevaHora, motivo: motivoAccion }),
    })
    if (res.ok) {
      setPostergando(null); setNuevaFecha(""); setNuevaHora(""); setMotivoAccion("")
      await loadCatalogs()
    } else { alert("No se pudo postergar el turno") }
  }

  async function handleCambiarEstado(id: number, estado: string) {
    await fetch(`${API_BASE}/api/turnos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    })
    await loadCatalogs()
  }

  return (
    <>
      {/* FORMULARIO NUEVO TURNO */}
      <section className="panel-card block-form" id="nuevo-turno">
        <h3>Nuevo turno</h3>
        {descuentoInfo && (
          <div style={{ padding: "10px 14px", marginBottom: "12px", borderRadius: "7px", background: "rgba(250,204,21,0.15)", color: "#facc15", fontSize: "13px", border: "1px solid rgba(250,204,21,0.4)" }}>
            🎉 {descuentoInfo.nombre}: <strong>{descuentoInfo.porcentaje}% de descuento</strong> aplicado automáticamente
          </div>
        )}
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="button-row" style={{ gridColumn: "1/-1" }}>
            <button type="button" className="outline-button" onClick={() => setQuickDate(0)}>
              Hoy
            </button>
            <button type="button" className="outline-button" onClick={() => setQuickDate(1)}>
              Mañana
            </button>
            <button type="button" className="outline-button" onClick={() => setForm((current) => ({ ...emptyForm, profesional_id: current.profesional_id }))}>
              Limpiar
            </button>
          </div>

          <label>Cliente
            <select required value={form.cliente_id} onChange={(e) => updateField("cliente_id", e.target.value)}>
              <option value="">Seleccionar cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>

          <label>Mascota
            <select required value={form.mascota_id} onChange={(e) => updateField("mascota_id", e.target.value)} disabled={!form.cliente_id}>
              <option value="">Seleccionar mascota</option>
              {mascotasFiltradas.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}{m.especie ? ` (${m.especie})` : ""}</option>
              ))}
            </select>
          </label>

          <label>Servicio
            <select required value={form.servicio_id} onChange={(e) => updateField("servicio_id", e.target.value)}>
              <option value="">Seleccionar servicio</option>
              {servicios.filter((s) => Boolean(s.activo)).map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}{s.categoria ? ` — ${s.categoria}` : ""}</option>
              ))}
            </select>
          </label>

          <label>Profesional
            <select value={form.profesional_id} onChange={(e) => updateField("profesional_id", e.target.value)}>
              <option value="">Sin asignar</option>
              {profesionales.filter((p) => p.activo !== 0 && p.activo !== false).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>

          <label>{esGuarderia ? "📅 Fecha de ingreso" : "Fecha"}
            <input type="date" required value={form.fecha} onChange={(e) => updateField("fecha", e.target.value)} />
          </label>

          <label>{esGuarderia ? "🕐 Hora de ingreso" : "Hora"}
            {slots.length > 0 ? (
              <select required value={form.hora} onChange={(e) => updateField("hora", e.target.value)}>
                <option value="">Seleccionar horario</option>
                {slots.map((slot) => (
                  <option key={slot.hora} value={slot.hora} disabled={!slot.disponible}>
                    {slot.hora} — {slot.disponible ? "✅ Disponible" : `❌ ${slot.estado || "Ocupado"}`}
                  </option>
                ))}
              </select>
            ) : (
              <input type="time" required value={form.hora} onChange={(e) => updateField("hora", e.target.value)} />
            )}
          </label>

          {esGuarderia && (
            <>
              <label>📅 Fecha de egreso
                <input type="date" required={esGuarderia} value={form.fecha_egreso} onChange={(e) => updateField("fecha_egreso", e.target.value)} min={form.fecha} />
              </label>
              <label>🕐 Hora de egreso
                <input type="time" value={form.hora_egreso} onChange={(e) => updateField("hora_egreso", e.target.value)} />
              </label>
            </>
          )}

          {slotHint && <p className={slotHint.startsWith("⛔") ? "tone-red" : "tone-purple"} style={{ gridColumn: "1/-1" }}>{slotHint}</p>}

          <label style={{ gridColumn: "1/-1" }}>Observaciones
            <textarea value={form.observaciones} onChange={(e) => updateField("observaciones", e.target.value)} placeholder="Notas internas" />
          </label>

          <div className="button-row">
            <button className="outline-button yellow" type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Crear turno"}
            </button>
          </div>
        </form>
        {message && <p className="tone-green">{message}</p>}
        {whatsappUrl && (
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className="outline-button yellow" style={{ display: "inline-block", marginTop: "8px" }}>
            💬 Confirmar por WhatsApp
          </a>
        )}
        {error && <p className="tone-red">{error}</p>}
      </section>

      {/* TABLA DE TURNOS */}
      <section className="panel-card table-card" id="reservas">
        <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
          <h3 style={{ margin: 0, flex: 1 }}>Control de Reservas</h3>
          <input type="text" placeholder="Buscar cliente, mascota..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ padding: "6px 10px", fontSize: "13px", width: "200px" }} />
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ padding: "6px 10px", fontSize: "13px" }}>
            <option value="todos">Todos</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Confirmado">Confirmado</option>
            <option value="Completado">Completado</option>
            <option value="Cancelado">Cancelado</option>
          </select>
        </div>

        {loading ? (
          <p>Cargando turnos...</p>
        ) : turnosFiltrados.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No hay turnos{filtroEstado !== "todos" ? ` con estado "${filtroEstado}"` : ""}.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Cliente</th>
                <th>Mascota</th>
                <th>Servicio</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {turnosFiltrados.map((turno) => (
                <tr key={turno.id}>
                  <td style={{ fontSize: "12px" }}>
                    <div style={{ fontWeight: "600" }}>{String(turno.fecha).slice(0, 10)}</div>
                    <div style={{ color: "var(--muted)" }}>{String(turno.hora).slice(0, 5)}</div>
                  </td>
                  <td style={{ fontSize: "13px" }}>{turno.cliente_nombre || "-"}</td>
                  <td style={{ fontSize: "13px" }}>{turno.mascota_nombre || "-"}</td>
                  <td style={{ fontSize: "12px" }}>{servicioVisible(turno)}</td>
                  <td>
                    <select
                      value={turno.estado}
                      onChange={(e) => handleCambiarEstado(turno.id, e.target.value)}
                      className={estadoPill(turno.estado)}
                      style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "12px", color: "inherit" }}
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="Confirmado">Confirmado</option>
                      <option value="Completado">Completado</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
                  </td>
                  <td style={{ display: "flex", gap: "6px" }}>
                    {turno.estado !== "Cancelado" && turno.estado !== "Completado" && (
                      <>
                        <button
                          onClick={() => { setPostergando(turno); setNuevaFecha(String(turno.fecha).slice(0, 10)); setNuevaHora(String(turno.hora).slice(0, 5)); }}
                          title="Postergar"
                          style={{ padding: "4px 8px", fontSize: "12px", background: "rgba(126,34,206,0.3)", border: "1px solid rgba(126,34,206,0.5)", borderRadius: "4px", cursor: "pointer", color: "#e9d5ff" }}
                        >📅</button>
                        <button
                          onClick={() => handleCancelar(turno)}
                          title="Cancelar"
                          style={{ padding: "4px 8px", fontSize: "12px", background: "rgba(239,68,68,0.3)", border: "1px solid rgba(239,68,68,0.5)", borderRadius: "4px", cursor: "pointer", color: "#fca5a5" }}
                        >✕</button>
                      </>
                    )}
                    {whatsappTurnoUrl(turno) && (
                      <>
                        <a
                          href={whatsappTurnoUrl(turno)}
                          target="_blank"
                          rel="noreferrer"
                          title="WhatsApp"
                          onClick={() => marcarWhatsAppEnviado(turno)}
                          style={{ padding: "4px 8px", fontSize: "12px", background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.45)", borderRadius: "4px", cursor: "pointer", color: "#86efac", textDecoration: "none" }}
                        >💬</a>
                        {whatsappEnviado(turno) && (
                          <span title="WhatsApp enviado" style={{ padding: "4px 8px", fontSize: "11px", color: "#86efac" }}>✓ WhatsApp</span>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => handleEliminarTurno(turno)}
                      title="Eliminar reserva"
                      style={{ padding: "4px 8px", fontSize: "12px", background: "rgba(127,29,29,0.35)", border: "1px solid rgba(248,113,113,0.5)", borderRadius: "4px", cursor: "pointer", color: "#fecaca" }}
                    >🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* MODAL POSTERGAR */}
      {postergando && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--card)", borderRadius: "12px", padding: "28px", width: "380px", display: "grid", gap: "14px" }}>
            <h3 style={{ margin: 0 }}>📅 Postergar turno</h3>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
              {postergando.mascota_nombre} — {servicioVisible(postergando)}
            </p>
            <label style={{ display: "grid", gap: "6px", fontSize: "13px" }}>
              Nueva fecha
              <input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: "6px", fontSize: "13px" }}>
              Nueva hora
              <input type="time" value={nuevaHora} onChange={(e) => setNuevaHora(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: "6px", fontSize: "13px" }}>
              Motivo (opcional)
              <input type="text" value={motivoAccion} onChange={(e) => setMotivoAccion(e.target.value)} placeholder="Ej: Solicitud del cliente" />
            </label>
            <div style={{ display: "flex", gap: "10px" }}>
              <button className="outline-button yellow" onClick={handlePosterguar} style={{ flex: 1 }}>Confirmar</button>
              <button className="outline-button" onClick={() => setPostergando(null)} style={{ flex: 1 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
