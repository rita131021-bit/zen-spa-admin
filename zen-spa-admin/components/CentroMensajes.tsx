"use client"

import { useEffect, useRef, useState } from "react"
import { io, Socket } from "socket.io-client"
import { PageHeader, MetricCard } from "@/components/AdminShell"
import { API_BASE, SOCKET_BASE } from "@/lib/api"

type Conversacion = {
  cliente_id: number
  cliente_nombre: string
  whatsapp?: string | null
  ultimo_mensaje?: string | null
  ultimo_autor_tipo?: "cliente" | "admin" | null
  ultimo_autor_nombre?: string | null
  ultimo_en?: string | null
}

type ToastChat = { cliente_id: number; nombre: string; mensaje: string; hora: string }

type Mensaje = {
  id: number
  cliente_id: number
  autor_tipo: "cliente" | "admin"
  autor_nombre: string
  mensaje: string
  creado_en: string
}

function formatHora(v: string) {
  const d = new Date(v)
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
}

function formatFecha(v: string) {
  const d = new Date(v)
  const hoy = new Date()
  const esHoy = d.toDateString() === hoy.toDateString()
  if (esHoy) return "Hoy"
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
}

export default function CentroMensajes() {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([])
  const [activo, setActivo]                 = useState<Conversacion | null>(null)
  const [mensajes, setMensajes]             = useState<Mensaje[]>([])
  const [texto, setTexto]                   = useState("")
  const [loading, setLoading]               = useState(true)
  const [conectado, setConectado]           = useState(false)
  const [enviando, setEnviando]             = useState(false)
  const [error, setError]                   = useState("")
  const [limpiandoViejos, setLimpiandoViejos] = useState(false)
  const [seleccionados, setSeleccionados] = useState<number[]>([])
  const [toastChat, setToastChat] = useState<ToastChat | null>(null)
  const [sonidoActivo, setSonidoActivo] = useState(true)
  const [permisoNotificaciones, setPermisoNotificaciones] = useState<NotificationPermission | "unsupported">("default")
  const [noLeidos, setNoLeidos] = useState<Record<number, number>>({})
  const [leidos, setLeidos] = useState<Record<number, string>>({})
  const socketRef = useRef<Socket | null>(null)
  const scrollRef  = useRef<HTMLDivElement>(null)
  const activoRef = useRef<Conversacion | null>(null)

  function reproducirSonido() {
    if (!sonidoActivo) return
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.value = 0.04
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      window.setTimeout(() => { osc.stop(); ctx.close() }, 140)
    } catch {}
  }

  function notificarMensaje(payload: Mensaje) {
    const nombre = payload.autor_nombre || "Cliente"
    const mensaje = payload.mensaje || "Nuevo mensaje"
    setToastChat({ cliente_id: payload.cliente_id, nombre, mensaje, hora: formatHora(payload.creado_en) })
    window.setTimeout(() => setToastChat((actual) => actual?.cliente_id === payload.cliente_id ? null : actual), 9000)
    reproducirSonido()
    if ("Notification" in window) {
      setPermisoNotificaciones(Notification.permission)
      if (Notification.permission === "granted") {
        const n = new Notification(nombre, { body: mensaje })
        n.onclick = () => { window.focus(); void abrirPorClienteId(payload.cliente_id); n.close() }
      }
    } else {
      setPermisoNotificaciones("unsupported")
    }
  }

  async function activarNotificaciones() {
    if (!("Notification" in window)) {
      setPermisoNotificaciones("unsupported")
      return
    }
    const permiso = await Notification.requestPermission()
    setPermisoNotificaciones(permiso)
  }

  async function abrirPorClienteId(clienteId: number) {
    const existente = conversaciones.find((c) => c.cliente_id === clienteId)
    if (existente) await abrirConversacion(existente)
  }

  function marcarLeida(c: Conversacion) {
    if (!c.ultimo_en) return
    setLeidos((actuales) => ({ ...actuales, [c.cliente_id]: c.ultimo_en || "" }))
    try {
      window.localStorage?.setItem(`zen-admin-chat-read-${c.cliente_id}`, c.ultimo_en)
    } catch {}
  }

  function conversacionSinLeer(c: Conversacion) {
    if (noLeidos[c.cliente_id]) return noLeidos[c.cliente_id]
    if (c.ultimo_autor_tipo !== "cliente" || !c.ultimo_en) return 0
    const leido = leidos[c.cliente_id]
    return leido === c.ultimo_en ? 0 : 1
  }

  // Cargar lista de conversaciones
  async function cargarConversaciones() {
    try {
      const res = await fetch(`${API_BASE}/api/chat/conversaciones`)
      if (res.ok) {
        const data = await res.json()
        const ordenadas = Array.isArray(data) ? [...data].sort((a, b) => {
          const aTime = a.ultimo_en ? new Date(a.ultimo_en).getTime() : 0
          const bTime = b.ultimo_en ? new Date(b.ultimo_en).getTime() : 0
          if (bTime !== aTime) return bTime - aTime
          if (Boolean(b.ultimo_en) !== Boolean(a.ultimo_en)) return b.ultimo_en ? 1 : -1
          return String(a.cliente_nombre || "").localeCompare(String(b.cliente_nombre || ""))
        }) : []
        setConversaciones(ordenadas)
        setLeidos((actuales) => {
          const siguientes = { ...actuales }
          for (const c of ordenadas) {
            if (!c.ultimo_en || siguientes[c.cliente_id]) continue
            try {
              const guardado = window.localStorage?.getItem(`zen-admin-chat-read-${c.cliente_id}`)
              if (guardado) siguientes[c.cliente_id] = guardado
            } catch {}
          }
          return siguientes
        })
      }
    } catch {}
    setLoading(false)
  }

  async function cargarMensajesCliente(clienteId: number) {
    try {
      const res = await fetch(`${API_BASE}/api/chat/${clienteId}`)
      if (res.ok) {
        const data = await res.json()
        setMensajes(Array.isArray(data) ? data : [])
      }
    } catch {}
  }

  // Cargar mensajes de una conversación
  async function abrirConversacion(c: Conversacion) {
    setActivo(c)
    activoRef.current = c
    setSeleccionados([])
    marcarLeida(c)
    setNoLeidos((actuales) => {
      const copia = { ...actuales }
      delete copia[c.cliente_id]
      return copia
    })
    await cargarMensajesCliente(c.cliente_id)
  }

  useEffect(() => {
    activoRef.current = activo
  }, [activo])

  useEffect(() => {
    if ("Notification" in window) setPermisoNotificaciones(Notification.permission)
    else setPermisoNotificaciones("unsupported")
  }, [])

  // Conectar socket una sola vez
  useEffect(() => {
    cargarConversaciones()

    const socket = io(SOCKET_BASE, { transports: ["websocket", "polling"] })
    socketRef.current = socket

    socket.on("connect", () => {
      setConectado(true)
      socket.emit("join", { role: "admin" })
    })
    socket.on("disconnect", () => setConectado(false))

    socket.on("mensaje:nuevo", (payload: Mensaje) => {
      setActivo((current) => {
        const esConversacionActiva = current && current.cliente_id === payload.cliente_id
        if (esConversacionActiva) {
          setMensajes((prev) => prev.some((m) => m.id === payload.id) ? prev : [...prev, payload])
        } else if (payload.autor_tipo === "cliente") {
          setNoLeidos((actuales) => ({ ...actuales, [payload.cliente_id]: (actuales[payload.cliente_id] || 0) + 1 }))
        }
        if (payload.autor_tipo === "cliente") notificarMensaje(payload)
        return current
      })
      cargarConversaciones()
    })

    socket.on("mensaje:eliminado", (payload: { id: number; cliente_id: number }) => {
      setActivo((current) => {
        if (current && current.cliente_id === payload.cliente_id) {
          setMensajes((prev) => prev.filter((m) => m.id !== payload.id))
          setSeleccionados((prev) => prev.filter((id) => id !== payload.id))
        }
        return current
      })
      cargarConversaciones()
    })

    socket.on("conversacion:limpiada", (payload: { cliente_id: number }) => {
      setActivo((current) => {
        if (current && current.cliente_id === payload.cliente_id) setMensajes([])
        return current
      })
      cargarConversaciones()
    })

    socket.on("mensajes:antiguos_eliminados", () => {
      cargarConversaciones()
      const current = activoRef.current
      if (current) cargarMensajesCliente(current.cliente_id)
    })

    const refresco = window.setInterval(() => {
      cargarConversaciones()
      const current = activoRef.current
      if (current) cargarMensajesCliente(current.cliente_id)
    }, 5000)

    return () => {
      window.clearInterval(refresco)
      socket.disconnect()
    }
  }, [])

  // Scroll al final cuando hay nuevos mensajes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [mensajes])

  async function enviarMensaje() {
    if (!activo || !texto.trim() || enviando) return
    const mensaje = texto.trim()
    setTexto("")
    setEnviando(true)
    setError("")

    try {
      const res = await fetch(API_BASE + "/api/chat/" + activo.cliente_id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje, autor_tipo: "admin", autor_nombre: "Romina" }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "No se pudo enviar el mensaje")
      const nuevo = data?.data as Mensaje | undefined
      if (nuevo) setMensajes((prev) => prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo])
      await cargarConversaciones()
    } catch (err) {
      setTexto(mensaje)
      setError(err instanceof Error ? err.message : "No se pudo enviar el mensaje")
    } finally {
      setEnviando(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      enviarMensaje()
    }
  }

  async function eliminarMensaje(id: number) {
    if (!activo) return
    const ok = window.confirm("¿Eliminar este mensaje?")
    if (!ok) return
    setError("")
    const anteriores = mensajes
    setMensajes((prev) => prev.filter((m) => m.id !== id))
    try {
      const res = await fetch(API_BASE + "/api/chat/mensaje/" + id, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "No se pudo eliminar el mensaje")
      await cargarConversaciones()
    } catch (err) {
      setMensajes(anteriores)
      setError(err instanceof Error ? err.message : "No se pudo eliminar el mensaje")
    }
  }

  async function borrarMensajesViejos() {
    const ok = window.confirm("¿Eliminar mensajes con más de 7 días? Las conversaciones recientes quedan igual.")
    if (!ok) return
    setLimpiandoViejos(true)
    setError("")
    try {
      const res = await fetch(API_BASE + "/api/chat/antiguos?dias=7", { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "No se pudieron borrar los mensajes viejos")
      await cargarConversaciones()
      if (activoRef.current) await cargarMensajesCliente(activoRef.current.cliente_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron borrar los mensajes viejos")
    } finally {
      setLimpiandoViejos(false)
    }
  }

  function toggleMensajeSeleccionado(id: number) {
    setSeleccionados((actuales) => actuales.includes(id) ? actuales.filter((item) => item !== id) : [...actuales, id])
  }

  async function borrarSeleccionados() {
    if (!activo || seleccionados.length === 0) return
    const ok = window.confirm(`¿Eliminar ${seleccionados.length} mensaje(s) seleccionado(s)?`)
    if (!ok) return
    const ids = [...seleccionados]
    const anteriores = mensajes
    setError("")
    setMensajes((actuales) => actuales.filter((m) => !ids.includes(m.id)))
    setSeleccionados([])
    try {
      for (const id of ids) {
        const res = await fetch(API_BASE + "/api/chat/mensaje/" + id, { method: "DELETE" })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || "No se pudieron borrar los mensajes seleccionados")
      }
      await cargarConversaciones()
    } catch (err) {
      setMensajes(anteriores)
      setError(err instanceof Error ? err.message : "No se pudieron borrar los mensajes seleccionados")
    }
  }

  async function limpiarConversacion() {
    if (!activo || mensajes.length === 0) return
    const ok = window.confirm("¿Eliminar todos los mensajes de esta conversación?")
    if (!ok) return
    const clienteId = activo.cliente_id
    const anteriores = mensajes
    setError("")
    setMensajes([])
    try {
      const res = await fetch(API_BASE + "/api/chat/" + clienteId, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "No se pudo limpiar la conversación")
      await cargarConversaciones()
    } catch (err) {
      setMensajes(anteriores)
      setError(err instanceof Error ? err.message : "No se pudo limpiar la conversación")
    }
  }

  const sinLeer = conversaciones.filter((c) => c.ultimo_mensaje).length
  const totalNoLeidos = conversaciones.reduce((total, c) => total + conversacionSinLeer(c), 0)

  return (
    <>
      <PageHeader
        eyebrow="💬 Chat"
        title="Centro de Mensajes"
        subtitle="Conversaciones en tiempo real con tus clientes desde la web."
        action={
          <span style={{
            display: "flex", alignItems: "center", gap: "6px", fontSize: "12px",
            color: conectado ? "#86efac" : "#fca5a5"
          }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: conectado ? "#22c55e" : "#ef4444" }} />
            {conectado ? "Conectado en tiempo real" : "Desconectado"}
          </span>
        }
      />

      <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 0 14px" }}>
        <button onClick={borrarMensajesViejos} className="outline-button" disabled={limpiandoViejos}>
          {limpiandoViejos ? "Borrando..." : "Borrar +7 días"}
        </button>
      </div>

      {toastChat && (
        <div style={{ position: "fixed", top: 18, right: 18, zIndex: 9999, width: 300, background: "#0f172a", border: "1px solid rgba(167,139,250,0.45)", borderRadius: 10, padding: 12, boxShadow: "0 14px 38px rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#7c3aed", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{toastChat.nombre.slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13 }}>{toastChat.nombre}</strong>
              <p style={{ margin: "3px 0", color: "#cbd5e1", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{toastChat.mensaje}</p>
              <span style={{ color: "#94a3b8", fontSize: 11 }}>{toastChat.hora}</span>
            </div>
            <button onClick={() => { void abrirPorClienteId(toastChat.cliente_id); setToastChat(null) }} style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 6, padding: "6px 8px", fontSize: 11, cursor: "pointer" }}>Abrir</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {totalNoLeidos > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#dc2626", color: "white", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 800 }}>
            {totalNoLeidos > 9 ? "9+" : totalNoLeidos} mensaje{totalNoLeidos === 1 ? "" : "s"} nuevo{totalNoLeidos === 1 ? "" : "s"}
          </span>
        )}
        {permisoNotificaciones === "default" && (
          <button className="outline-button" style={{ fontSize: 11 }} onClick={activarNotificaciones}>Activar notificaciones</button>
        )}
        {permisoNotificaciones === "granted" && (
          <span style={{ color: "#86efac", fontSize: 12, alignSelf: "center" }}>Notificaciones activas</span>
        )}
        <button className="outline-button" style={{ fontSize: 11 }} onClick={() => setSonidoActivo((v) => !v)}>{sonidoActivo ? "Sonido activo" : "Sonido apagado"}</button>
      </div>

      <section className="metrics-grid five">
        <MetricCard label="Conversaciones" value={String(conversaciones.length)} detail="Clientes con chat" tone="purple" />
        <MetricCard label="Con mensajes"   value={String(sinLeer)}               detail="Activas"          tone="green" />
        <MetricCard label="Estado"          value={conectado ? "En vivo" : "Off"} detail="Conexión socket"  tone={conectado ? "green" : "red"} />
      </section>

      <section className="panel-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "520px" }}>

          {/* Lista de conversaciones */}
          <div style={{ borderRight: "1px solid rgba(255,255,255,0.06)", overflowY: "auto", maxHeight: "520px" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "600", fontSize: "13px" }}>
              Conversaciones
            </div>
            {loading ? (
              <p style={{ padding: "16px", color: "var(--muted)", fontSize: "13px" }}>Cargando...</p>
            ) : conversaciones.length === 0 ? (
              <p style={{ padding: "16px", color: "var(--muted)", fontSize: "13px" }}>
                Sin conversaciones todavía. Los mensajes de clientes desde la web aparecerán acá.
              </p>
            ) : (
              conversaciones.map((c) => (
                <button
                  key={c.cliente_id}
                  onClick={() => abrirConversacion(c)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "12px 16px",
                    background: activo?.cliente_id === c.cliente_id ? "rgba(126,34,206,0.15)" : "transparent",
                    border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", gap: "8px" }}>
                    <strong style={{ fontSize: "13px", color: "#e9d5ff" }}>{c.cliente_nombre}</strong>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {conversacionSinLeer(c) ? (
                        <span title="Mensajes nuevos" style={{ minWidth: "18px", height: "18px", padding: "0 6px", borderRadius: "999px", background: "#dc2626", color: "white", fontSize: "11px", lineHeight: "18px", textAlign: "center" }}>
                          {conversacionSinLeer(c) > 9 ? "9+" : conversacionSinLeer(c)}
                        </span>
                      ) : null}
                      {c.ultimo_en && <span style={{ fontSize: "11px", color: "var(--muted)" }}>{formatFecha(c.ultimo_en)}</span>}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.ultimo_mensaje || "Sin mensajes"}
                  </p>
                </button>
              ))
            )}
          </div>

          {/* Conversación activa */}
          <div style={{ display: "flex", flexDirection: "column", height: "520px" }}>
            {!activo ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "13px" }}>
                Seleccioná una conversación para ver los mensajes
              </div>
            ) : (
              <>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                  <div>
                    <strong style={{ fontSize: "14px" }}>{activo.cliente_nombre}</strong>
                    {activo.whatsapp && (
                      <span style={{ marginLeft: "10px", fontSize: "12px", color: "#22c55e" }}>
                        💬 {activo.whatsapp}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      onClick={borrarSeleccionados}
                      className="outline-button"
                      disabled={seleccionados.length === 0}
                      style={{ fontSize: "11px", padding: "6px 10px" }}
                    >
                      Borrar seleccionados{seleccionados.length ? ` (${seleccionados.length})` : ""}
                    </button>
                    <button
                      onClick={limpiarConversacion}
                      className="outline-button"
                      disabled={mensajes.length === 0}
                      style={{ fontSize: "11px", padding: "6px 10px" }}
                    >
                      Limpiar chat
                    </button>
                  </div>
                </div>

                <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {mensajes.length === 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "13px", textAlign: "center" }}>Sin mensajes aún.</p>
                  ) : (
                    mensajes.map((m) => (
                      <div key={m.id} style={{
                        alignSelf: m.autor_tipo === "admin" ? "flex-end" : "flex-start",
                        maxWidth: "70%",
                        background: m.autor_tipo === "admin" ? "rgba(126,34,206,0.3)" : "rgba(255,255,255,0.06)",
                        border: `1px solid ${m.autor_tipo === "admin" ? "rgba(126,34,206,0.5)" : "rgba(255,255,255,0.1)"}`,
                        borderRadius: "10px", padding: "8px 12px",
                      }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginRight: "6px", fontSize: "11px", color: "var(--muted)", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={seleccionados.includes(m.id)}
                            onChange={() => toggleMensajeSeleccionado(m.id)}
                          />
                          Seleccionar
                        </label>
                        <button
                          onClick={() => eliminarMensaje(m.id)}
                          title="Eliminar mensaje"
                          style={{
                            float: "right", marginLeft: "8px", border: "none", background: "transparent",
                            color: "var(--muted)", cursor: "pointer", fontSize: "12px", lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                        <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>{m.mensaje}</p>
                        <span style={{ fontSize: "10px", color: "var(--muted)" }}>
                          {m.autor_nombre} · {formatHora(m.creado_en)}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {error && (
                  <div style={{ margin: "0 16px 10px", padding: "8px 10px", borderRadius: "8px", background: "rgba(239,68,68,0.14)", color: "#fca5a5", fontSize: "12px" }}>
                    {error}
                  </div>
                )}
                <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "8px" }}>
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Escribí un mensaje... (Enter para enviar)"
                    style={{ flex: 1, minHeight: "40px", maxHeight: "100px", fontSize: "13px", resize: "none" }}
                  />
                  <button onClick={enviarMensaje} className="outline-button yellow" disabled={!texto.trim() || enviando}>
                    {enviando ? "Enviando..." : "Enviar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
