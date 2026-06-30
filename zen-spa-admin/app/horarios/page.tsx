import AdminShell, { PageHeader } from "@/components/AdminShell"
import ProfesionalesManager from "@/components/ProfesionalesManager"
import ScheduleBlocksPanel from "@/components/ScheduleBlocksPanel"
import { fetchApi, Profesional } from "@/lib/api"

type LocalDisponibilidad = {
  id: number
  nombre: string
  direccion?: string | null
  tipo?: string | null
  activo?: boolean | number
}

const horarioBasePorLocal: Record<string, { dias: string; horario: string; noLaboral: string }> = {
  "Villaguay al 1000": {
    dias: "Lunes a Sabado",
    horario: "08:00 a 18:00",
    noLaboral: "Domingo",
  },
  "Juan Baez al final": {
    dias: "Lunes a Sabado",
    horario: "08:00 a 18:00",
    noLaboral: "Domingo",
  },
}

function LocalesDisponibilidad({ locales }: { locales: LocalDisponibilidad[] }) {
  const visibles = locales.length > 0 ? locales : [
    { id: 1, nombre: "Villaguay al 1000", direccion: "Villaguay al 1000", tipo: "Peluqueria / Spa", activo: true },
    { id: 2, nombre: "Juan Baez al final", direccion: "Juan Baez al final", tipo: "Guarderia", activo: true },
  ]

  return (
    <section className="panel-card" style={{ marginBottom: "18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "14px", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: "0 0 4px", color: "var(--muted)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Locales</p>
          <h2 style={{ margin: 0, fontSize: "20px" }}>Horarios disponibles por local</h2>
        </div>
        <span style={{ color: "#86efac", fontSize: "12px", fontWeight: 700 }}>Conectado a la disponibilidad de reservas web</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
        {visibles.map((local) => {
          const horario = horarioBasePorLocal[local.nombre] || horarioBasePorLocal["Villaguay al 1000"]
          return (
            <article key={local.id} style={{ border: "1px solid rgba(167,139,250,0.22)", borderRadius: "8px", padding: "14px", background: "rgba(15,23,42,0.42)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
                <strong style={{ fontSize: "15px" }}>{local.nombre}</strong>
                <span style={{ color: local.activo === false ? "#fca5a5" : "#86efac", fontSize: "12px", fontWeight: 700 }}>{local.activo === false ? "Inactivo" : "Activo"}</span>
              </div>
              <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: "13px" }}>{local.tipo || "Local"}</p>
              <div style={{ display: "grid", gap: "8px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <span style={{ color: "var(--muted)" }}>Direccion</span>
                  <strong style={{ textAlign: "right" }}>{local.direccion || local.nombre}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <span style={{ color: "var(--muted)" }}>Dias laborales</span>
                  <strong style={{ textAlign: "right" }}>{horario.dias}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <span style={{ color: "var(--muted)" }}>Horario</span>
                  <strong style={{ textAlign: "right" }}>{horario.horario}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <span style={{ color: "var(--muted)" }}>No laboral</span>
                  <strong style={{ textAlign: "right" }}>{horario.noLaboral}</strong>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default async function HorariosPage() {
  const profesionales = await fetchApi<Profesional[]>("/api/profesionales", [])
  const locales = await fetchApi<LocalDisponibilidad[]>("/api/disponibilidad/locales", [])

  return (
    <AdminShell>
      <PageHeader
        eyebrow="Equipo"
        title="Horarios y Disponibilidad"
        subtitle="Gestiona locales, equipo, disponibilidad, bloqueos y vacaciones."
      />
      <LocalesDisponibilidad locales={locales} />
      <ProfesionalesManager initialProfesionales={profesionales} />
      <ScheduleBlocksPanel />
    </AdminShell>
  )
}
