import AdminShell, { PageHeader } from "@/components/AdminShell"
import LocalesDisponibilidadManager, { LocalDisponibilidad } from "@/components/LocalesDisponibilidadManager"
import ProfesionalesManager from "@/components/ProfesionalesManager"
import ScheduleBlocksPanel from "@/components/ScheduleBlocksPanel"
import { fetchApi, Profesional } from "@/lib/api"

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
      <LocalesDisponibilidadManager initialLocales={locales} />
      <ProfesionalesManager initialProfesionales={profesionales} initialLocales={locales} />
      <ScheduleBlocksPanel />
    </AdminShell>
  )
}
