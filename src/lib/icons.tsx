import {
  AlignLeft,
  Award,
  BadgeCheck,
  Bike,
  BookOpen,
  Briefcase,
  Camera,
  ChartLine,
  ChefHat,
  Code,
  Coffee,
  Compass,
  Contact,
  Dumbbell,
  FolderKanban,
  Gamepad2,
  Globe,
  GraduationCap,
  HandHeart,
  Handshake,
  Heart,
  Languages,
  LayoutList,
  Leaf,
  Lightbulb,
  Link,
  Mail,
  MapPin,
  Medal,
  Mountain,
  Music,
  Palette,
  Phone,
  Plane,
  Puzzle,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy,
  User,
  Users,
  Waves,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { SVGProps } from 'react'

function brand(path: string) {
  const C = (props: SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number }) => {
    const { size = 24, strokeWidth: _sw, ...rest } = props
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}>
        <path d={path} />
      </svg>
    )
  }
  return C as unknown as LucideIcon
}

export const LinkedinIcon = brand(
  'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z',
)
export const GithubIcon = brand(
  'M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3',
)

export const ICONS: Record<string, LucideIcon> = {
  user: User,
  briefcase: Briefcase,
  'graduation-cap': GraduationCap,
  wrench: Wrench,
  languages: Languages,
  'badge-check': BadgeCheck,
  'folder-kanban': FolderKanban,
  trophy: Trophy,
  heart: Heart,
  'hand-heart': HandHeart,
  award: Award,
  'book-open': BookOpen,
  contact: Contact,
  'layout-list': LayoutList,
  'align-left': AlignLeft,
  star: Star,
  target: Target,
  rocket: Rocket,
  users: Users,
  lightbulb: Lightbulb,
  zap: Zap,
  shield: Shield,
  'chart-line': ChartLine,
  handshake: Handshake,
  medal: Medal,
  sparkles: Sparkles,
  puzzle: Puzzle,
  code: Code,
  compass: Compass,
  music: Music,
  'gamepad-2': Gamepad2,
  bike: Bike,
  camera: Camera,
  plane: Plane,
  coffee: Coffee,
  mountain: Mountain,
  dumbbell: Dumbbell,
  palette: Palette,
  'chef-hat': ChefHat,
  leaf: Leaf,
  waves: Waves,
  globe: Globe,
  mail: Mail,
  phone: Phone,
  'map-pin': MapPin,
  link: Link,
  linkedin: LinkedinIcon,
  github: GithubIcon,
}

export const PICKABLE_ICONS = [
  'star', 'trophy', 'target', 'rocket', 'users', 'lightbulb', 'zap', 'shield', 'chart-line', 'handshake', 'medal',
  'sparkles', 'puzzle', 'code', 'compass', 'briefcase', 'graduation-cap', 'heart', 'music', 'gamepad-2', 'bike',
  'camera', 'plane', 'coffee', 'mountain', 'dumbbell', 'palette', 'chef-hat', 'leaf', 'waves', 'globe', 'book-open',
]

export function Icon({ name, size = 14, ...rest }: { name?: string; size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }) {
  const C = (name && ICONS[name]) || Star
  return <C size={size} {...rest} />
}
