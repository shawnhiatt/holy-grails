// Icon shim — Phosphor icons aliased to the legacy Lucide names used across the app.
//
// The app migrated from lucide-react to @phosphor-icons/react. Components keep the
// old Lucide names; this file is the single mapping point. Import icons from here,
// never from @phosphor-icons/react directly.
//
// Phosphor has no strokeWidth prop — boldness comes from the `weight` prop instead:
//   regular = app-wide default (set globally via IconContext in main.tsx, size 24)
//   fill    = active states (selected nav tab, filled heart/bolt/star, solid Play)
//   bold    = emphasis (small confirm checks that used strokeWidth 2.5–3)
//   duotone = unused — do not introduce without a design pass
//
// Deliberate glyph choices (not straight ports):
//   Disc3              → VinylRecord (a real record beats the generic three-ring disc)
//   GalleryVerticalEnd → CardsThree  (reads as records standing in a crate)
export {
  WarningIcon as AlertTriangle,
  ArrowLeftIcon as ArrowLeft,
  ChartBarIcon as BarChart3,
  CalendarIcon as Calendar,
  CheckIcon as Check,
  CheckCircleIcon as CheckCircle2,
  CaretDownIcon as ChevronDown,
  CaretLeftIcon as ChevronLeft,
  CaretRightIcon as ChevronRight,
  VinylRecordIcon as Disc3,
  FolderOpenIcon as FolderOpen,
  CardsThreeIcon as GalleryVerticalEnd,
  GridFourIcon as Grid2x2,
  GridNineIcon as Grid3x3,
  DotsSixVerticalIcon as GripVertical,
  HeadphonesIcon as Headphones,
  HeartIcon as Heart,
  QuestionIcon as HelpCircle,
  ClockCounterClockwiseIcon as History,
  InfoIcon as Info,
  ListIcon as List,
  LockIcon as Lock,
  SignOutIcon as LogOut,
  MapPinIcon as MapPin,
  MinusIcon as Minus,
  MoonIcon as Moon,
  MusicNotesIcon as Music,
  NewspaperIcon as Newspaper,
  PencilSimpleIcon as Pencil,
  PlayIcon as Play,
  PlusIcon as Plus,
  ArrowsClockwiseIcon as RefreshCw,
  ArrowCounterClockwiseIcon as RotateCcw,
  BarcodeIcon as ScanBarcode,
  ScissorsIcon as Scissors,
  MagnifyingGlassIcon as Search,
  ShuffleIcon as Shuffle,
  SlidersHorizontalIcon as SlidersHorizontal,
  SquareIcon as Square,
  // Icons added post-migration under their Phosphor names (no Lucide predecessor):
  BroomIcon as Broom, // the Purge feature identity — nav, Settings tile, unrated insight
  StackMinusIcon as StackMinus, // the "cut" purge verdict — remove from the stack
  ImageSquareIcon as ImageSquare, // sleeve/cover condition (Media uses the vinyl disc)
  StarIcon as Star,
  SunIcon as Sun,
  TrashIcon as Trash2,
  TrendUpIcon as TrendingUp,
  UserMinusIcon as UserMinus,
  UserPlusIcon as UserPlus,
  UserIcon as UserRound,
  UsersIcon as Users,
  WifiSlashIcon as WifiOff,
  XIcon as X,
  LightningIcon as Zap,
} from "@phosphor-icons/react";

export { IconContext } from "@phosphor-icons/react";
export type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
