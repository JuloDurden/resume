import type { JobStatus, JobTarget, ResumeDoc } from '../types'
import { uid } from './ids'

export const JOB_STATUS: Record<JobStatus, string> = {
  todo: 'À postuler',
  applied: 'Candidature envoyée',
  interview: 'Entretien',
  rejected: 'Refusée',
  offer: 'Proposition',
}

/** Liste des offres du CV, en reprenant une éventuelle offre créée avant l'historique. */
export function jobsOf(d: ResumeDoc): JobTarget[] {
  if (d.jobs?.length) return d.jobs
  if (d.job && (d.job.description || d.job.title)) return [{ ...d.job, id: d.job.id ?? 'initial', createdAt: d.job.createdAt ?? d.createdAt }]
  return []
}

/** Met à jour l'offre active et sa copie dans l'historique. */
export function saveJob(d: ResumeDoc, j: JobTarget): ResumeDoc {
  const job = { ...j, id: j.id ?? uid(), createdAt: j.createdAt ?? Date.now(), status: j.status ?? 'todo' }
  const list = jobsOf(d).filter((x) => x.id !== 'initial' || job.id === 'initial')
  const exists = list.some((x) => x.id === job.id)
  return { ...d, job, jobs: exists ? list.map((x) => (x.id === job.id ? job : x)) : [job, ...list] }
}

export function selectJob(d: ResumeDoc, id: string): ResumeDoc {
  const j = jobsOf(d).find((x) => x.id === id)
  return j ? { ...d, job: j, jobs: jobsOf(d) } : d
}

export function newJob(d: ResumeDoc): ResumeDoc {
  const job: JobTarget = { id: uid(), createdAt: Date.now(), status: 'todo' }
  return { ...d, job, jobs: [job, ...jobsOf(d)] }
}

export function deleteJob(d: ResumeDoc, id: string): ResumeDoc {
  const jobs = jobsOf(d).filter((x) => x.id !== id)
  return { ...d, jobs, job: d.job?.id === id ? jobs[0] : d.job }
}
