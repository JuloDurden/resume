import { uid } from '../lib/ids'
import { todayFr } from '../lib/dates'
import type { Header, LetterDoc, LetterOptions, ResumeDoc, Section, SectionItem, SectionType } from '../types'
import { SECTION_DEFS } from './sectionDefs'
import { applyTemplate, templateStyle } from './templates'
import { applyLetterTemplate } from './letterTemplates'

export function makeSection(type: SectionType, items: Omit<SectionItem, 'id'>[] = [], title?: string): Section {
  const def = SECTION_DEFS[type]
  return {
    id: uid(),
    type,
    title: title ?? def.defaultTitle,
    items: items.map((i) => ({ ...i, id: uid() })),
    options: { ...def.defaults },
  }
}

function emptyHeader(): Header {
  return {
    name: 'Prénom Nom',
    title: 'Intitulé du poste visé',
    contacts: [
      { id: uid(), kind: 'email', value: 'prenom.nom@email.fr' },
      { id: uid(), kind: 'phone', value: '06 00 00 00 00' },
      { id: uid(), kind: 'location', value: 'Ville' },
      { id: uid(), kind: 'linkedin', value: 'linkedin.com/in/prenom-nom' },
    ],
  }
}

function sampleHeader(): Header {
  return {
    name: 'Camille Martin',
    title: 'Chef de projet digital',
    contacts: [
      { id: uid(), kind: 'email', value: 'camille.martin@email.fr' },
      { id: uid(), kind: 'phone', value: '06 12 34 56 78' },
      { id: uid(), kind: 'location', value: 'Montpellier' },
      { id: uid(), kind: 'linkedin', value: 'linkedin.com/in/camille-martin' },
    ],
  }
}

function sampleSections(): Section[] {
  return [
    makeSection('summary', [
      {
        description:
          'Chef de projet digital avec **12 ans d\'expérience** dans le pilotage de projets web et SI. J\'aligne les équipes métier et techniques autour d\'objectifs mesurables, en méthode agile comme en cycle en V, avec un fort sens du service.',
      },
    ]),
    makeSection('experience', [
      {
        title: 'Chef de projet digital',
        subtitle: 'Groupe Exemple',
        location: 'Montpellier',
        start: { month: 3, year: 2020 },
        current: true,
        description: 'Pilotage du portefeuille de projets digitaux (8 applications, 40 000 utilisateurs).',
        bullets: [
          'Pilotage de la refonte du portail client : **+35 %** de taux de satisfaction en 6 mois',
          'Animation d\'une équipe Scrum de 7 personnes, vélocité stabilisée en 3 sprints',
          'Mise en place d\'un suivi budgétaire mensuel : dépassements réduits de 20 %',
        ],
      },
      {
        title: 'Responsable support applicatif',
        subtitle: 'Société Démo',
        location: 'Toulouse',
        start: { month: 9, year: 2014 },
        end: { month: 2, year: 2020 },
        bullets: [
          'Management d\'une équipe de 6 techniciens N1/N2 selon les bonnes pratiques ITIL',
          'Réduction du délai moyen de résolution de 4 jours à 36 heures',
          'Déploiement de Zendesk et d\'une base de connaissances de 200 articles',
        ],
      },
    ]),
    makeSection('education', [
      {
        title: 'Master Management des systèmes d\'information',
        subtitle: 'Université Exemple',
        location: 'Montpellier',
        start: { year: 2012 },
        end: { year: 2014 },
      },
    ]),
    makeSection('skills', [
      { title: 'Gestion de projet', tags: ['Scrum', 'Kanban', 'Cycle en V', 'Gestion budgétaire', 'Recette'] },
      { title: 'Outils', tags: ['Jira', 'Confluence', 'Zendesk', 'Notion', 'SQL'] },
    ]),
    makeSection('certifications', [
      { title: 'Professional Scrum Product Owner I', subtitle: 'Scrum.org', end: { year: 2023 } },
      { title: 'ITIL 4 Foundation', subtitle: 'Axelos', end: { year: 2019 } },
    ]),
    makeSection('languages', [
      { title: 'Français', subtitle: 'Langue maternelle', level: 5 },
      { title: 'Anglais', subtitle: 'Courant (C1)', level: 4 },
    ]),
    makeSection('achievements', [
      { icon: 'rocket', title: 'Refonte du portail client', description: 'Livrée dans les délais et 8 % sous le budget.' },
      { icon: 'users', title: 'Montée en compétence', description: '5 collaborateurs accompagnés vers un poste de référent.' },
    ]),
    makeSection('interests', [
      { icon: 'bike', title: 'Cyclisme', description: 'Sorties longues le week-end' },
      { icon: 'music', title: 'Musique', description: 'Guitare et chorale' },
    ]),
  ]
}

function blankSections(): Section[] {
  return [
    makeSection('summary', [{ description: '' }]),
    makeSection('experience', [{ title: '', subtitle: '', bullets: [''] }]),
    makeSection('education', [{ title: '', subtitle: '' }]),
    makeSection('skills', [{ title: '', tags: [] }]),
    makeSection('languages', [{ title: 'Français', subtitle: 'Langue maternelle', level: 5 }]),
  ]
}

export function newResume(templateId: string, sample: boolean, name = 'Mon CV'): ResumeDoc {
  const sections = sample ? sampleSections() : blankSections()
  const now = Date.now()
  const base: ResumeDoc = {
    id: uid(),
    kind: 'resume',
    name,
    createdAt: now,
    updatedAt: now,
    templateId,
    style: templateStyle(templateId),
    layout: { columns: 1, sidebarPosition: 'right', sidebarWidth: 33, main: sections.map((s) => s.id), side: [] },
    header: sample ? sampleHeader() : emptyHeader(),
    sections,
  }
  return applyTemplate(base, templateId)
}

export function newLetter(templateId: string, sample: boolean, from?: ResumeDoc, name = 'Ma lettre de motivation'): LetterDoc {
  if (!from) return applyLetterTemplate(buildLetter(templateId, sample, undefined, name), 'directe')
  return buildLetter(templateId, sample, from, name)
}

function buildLetter(templateId: string, sample: boolean, from: ResumeDoc | undefined, name: string): LetterDoc {
  const now = Date.now()
  const style = from ? { ...from.style } : templateStyle(templateId)
  if (style.headerPlacement !== 'top') style.headerPlacement = 'top'
  // une lettre assortie à un CV deux colonnes reprend sa colonne latérale
  const options: Partial<LetterOptions> | undefined = from
    ? from.layout.columns === 2
      ? { layout: 'sidebar', sidebarPosition: from.layout.sidebarPosition, sidebarWidth: Math.min(from.layout.sidebarWidth, 33), recipientAlign: 'left', dateAlign: 'left', signatureAlign: 'left' }
      : { layout: 'single' }
    : undefined
  const header: Header = from
    ? { ...from.header, contacts: from.header.contacts.map((c) => ({ ...c })) }
    : sample
      ? sampleHeader()
      : emptyHeader()
  return {
    id: uid(),
    kind: 'letter',
    name,
    createdAt: now,
    updatedAt: now,
    templateId: from?.templateId ?? templateId,
    style,
    options,
    header,
    recipient: sample
      ? { name: 'Madame, Monsieur', title: 'Service recrutement', company: 'Entreprise Cible', address: '12 rue de l\'Exemple\n34000 Montpellier' }
      : { name: '', title: '', company: '', address: '' },
    place: 'Montpellier',
    date: todayFr(),
    subject: sample ? 'Candidature au poste de chef de projet digital' : 'Candidature au poste de ...',
    salutation: 'Madame, Monsieur,',
    body: sample
      ? 'Votre annonce pour le poste de chef de projet digital a retenu toute mon attention. Elle rejoint ce que je fais depuis plusieurs années : faire travailler ensemble métiers et équipes techniques pour livrer des services utiles.\n\nChez Groupe Exemple, j\'ai piloté la refonte du portail client, livrée dans les délais et sous le budget, avec une hausse de 35 % de la satisfaction. Auparavant, j\'ai dirigé une équipe support en appliquant les bonnes pratiques ITIL, ce qui m\'a appris à garder l\'utilisateur au centre des décisions.\n\nRejoindre votre équipe me permettrait de mettre cette double expérience au service de vos projets de transformation. Je serais heureux d\'en discuter avec vous lors d\'un entretien.'
      : '',
    closing: 'Je vous prie d\'agréer, Madame, Monsieur, l\'expression de mes salutations distinguées.',
    signature: header.name,
    linkedResumeId: from?.id,
  }
}
