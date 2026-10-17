"use client";

/**
 * Iconos del CRM, sobre Hugeicons (set libre, trazo redondeado).
 *
 * Cada icono se exporta con el nombre que tenía en Lucide, así los imports del
 * resto del código solo cambiaron de módulo y el JSX quedó igual. Para sumar un
 * icono: buscarlo en hugeicons.com (filtro "Free"), importarlo abajo y
 * exportarlo con `hugeicon()`. No importes `@hugeicons/core-free-icons`
 * directo en las páginas: pasando por acá el trazo es el mismo en todo el CRM.
 */
import { forwardRef } from "react";
import { HugeiconsIcon, type HugeiconsProps, type IconSvgElement } from "@hugeicons/react";
import {
  Activity01Icon,
  Add01Icon,
  AiBrain01Icon,
  AiChat02Icon,
  Alert02Icon,
  ArrowDataTransferHorizontalIcon,
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowUp01Icon,
  ArrowUp02Icon,
  ArrowUpDownIcon,
  Attachment01Icon,
  BookOpen01Icon,
  BubbleChatIcon,
  Building03Icon,
  BulbIcon,
  Calendar03Icon,
  CalendarCheckIn01Icon,
  CalendarLock01Icon,
  Call02Icon,
  CallRinging02Icon,
  Camera01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  ChartColumnIcon,
  ChartIncreaseIcon,
  CheckmarkCircle02Icon,
  CheckmarkSquare02Icon,
  CircleIcon,
  Clock01Icon,
  CodeIcon,
  Compass01Icon,
  ComputerIcon,
  Copy01Icon,
  CreditCardIcon,
  DashboardSquare01Icon,
  Delete02Icon,
  DeliveryTruck01Icon,
  DollarCircleIcon,
  Download04Icon,
  EraserIcon,
  File01Icon,
  FileDownloadIcon,
  FileValidationIcon,
  FileZipIcon,
  FilterIcon,
  Flag02Icon,
  FloppyDiskIcon,
  Globe02Icon,
  HeadphonesIcon,
  Image01Icon,
  ImageAdd01Icon,
  ImageNotFound01Icon,
  InboxIcon,
  InformationCircleIcon,
  Invoice01Icon,
  Key01Icon,
  Layers01Icon,
  LayoutLeftIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  Link02Icon,
  LinkSquare02Icon,
  Loading03Icon,
  Location01Icon,
  Logout03Icon,
  MagicWand01Icon,
  Mail01Icon,
  Maximize01Icon,
  Message01Icon,
  Mic01Icon,
  Minimize01Icon,
  Moon02Icon,
  MoreHorizontalIcon,
  Notification01Icon,
  Notification02Icon,
  NotificationOff01Icon,
  PackageAddIcon,
  PackageDeliveredIcon,
  PackageIcon,
  PauseIcon,
  PencilEdit01Icon,
  PencilEdit02Icon,
  PlayIcon,
  PowerServiceIcon,
  QrCodeIcon,
  QuoteDownIcon,
  RefreshIcon,
  RoboticIcon,
  RotateClockwiseIcon,
  Search01Icon,
  SecurityBlockIcon,
  SecurityCheckIcon,
  SentIcon,
  Settings01Icon,
  Settings02Icon,
  Share01Icon,
  Share08Icon,
  ShieldEnergyIcon,
  ShoppingCart01Icon,
  SidebarLeftIcon,
  SmileIcon,
  SourceCodeIcon,
  SparklesIcon,
  SquareLock02Icon,
  StarIcon,
  Store01Icon,
  Sun03Icon,
  Tag01Icon,
  Tag02Icon,
  Target01Icon,
  Target02Icon,
  Task01Icon,
  TextAlignLeftIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
  Tick02Icon,
  TickDouble02Icon,
  Timer02Icon,
  UnavailableIcon,
  Undo02Icon,
  UnfoldMoreIcon,
  Upload04Icon,
  UserAdd01Icon,
  UserCheck01Icon,
  UserGroupIcon,
  UserIcon,
  UserMultipleIcon,
  ViewIcon,
  ViewOffSlashIcon,
  Wallet01Icon,
  Wrench01Icon,
  WarehouseIcon,
  WebhookIcon,
  WorkHistoryIcon,
  Xls01Icon,
} from "@hugeicons/core-free-icons";

export type IconProps = Omit<HugeiconsProps, "icon" | "ref">;
export type IconComponent = ReturnType<typeof hugeicon>;

function hugeicon(icon: IconSvgElement, displayName: string) {
  const Icono = forwardRef<SVGSVGElement, IconProps>(function Icono({ strokeWidth = 1.8, ...props }, ref) {
    return <HugeiconsIcon ref={ref} icon={icon} strokeWidth={strokeWidth} {...props} />;
  });
  Icono.displayName = displayName;
  return Icono;
}

export const Activity = hugeicon(Activity01Icon, "Activity");
export const AlertTriangle = hugeicon(Alert02Icon, "AlertTriangle");
export const AlignLeft = hugeicon(TextAlignLeftIcon, "AlignLeft");
export const ArrowDown = hugeicon(ArrowDown02Icon, "ArrowDown");
export const ArrowLeft = hugeicon(ArrowLeft02Icon, "ArrowLeft");
export const ArrowRight = hugeicon(ArrowRight02Icon, "ArrowRight");
export const ArrowRightLeft = hugeicon(ArrowDataTransferHorizontalIcon, "ArrowRightLeft");
export const ArrowUp = hugeicon(ArrowUp02Icon, "ArrowUp");
export const ArrowUpDown = hugeicon(ArrowUpDownIcon, "ArrowUpDown");
export const Assistant = hugeicon(AiChat02Icon, "Assistant");
export const Ban = hugeicon(UnavailableIcon, "Ban");
export const BarChart2 = hugeicon(ChartColumnIcon, "BarChart2");
export const BarChart3 = hugeicon(ChartColumnIcon, "BarChart3");
export const Bell = hugeicon(Notification01Icon, "Bell");
export const BellDot = hugeicon(Notification02Icon, "BellDot");
export const BellOff = hugeicon(NotificationOff01Icon, "BellOff");
export const Bold = hugeicon(TextBoldIcon, "Bold");
export const BookOpen = hugeicon(BookOpen01Icon, "BookOpen");
export const Bot = hugeicon(RoboticIcon, "Bot");
export const Boxes = hugeicon(PackageIcon, "Boxes");
export const Brain = hugeicon(AiBrain01Icon, "Brain");
export const Building2 = hugeicon(Building03Icon, "Building2");
export const Calendar = hugeicon(Calendar03Icon, "Calendar");
export const CalendarCheck = hugeicon(CalendarCheckIn01Icon, "CalendarCheck");
export const CalendarClock = hugeicon(CalendarLock01Icon, "CalendarClock");
export const CalendarDays = hugeicon(Calendar03Icon, "CalendarDays");
export const CalendarIcon = hugeicon(Calendar03Icon, "CalendarIcon");
export const Camera = hugeicon(Camera01Icon, "Camera");
export const Check = hugeicon(Tick02Icon, "Check");
export const CheckCheck = hugeicon(TickDouble02Icon, "CheckCheck");
export const CheckCircle = hugeicon(CheckmarkCircle02Icon, "CheckCircle");
export const CheckCircle2 = hugeicon(CheckmarkCircle02Icon, "CheckCircle2");
export const CheckSquare = hugeicon(CheckmarkSquare02Icon, "CheckSquare");
export const ChevronDown = hugeicon(ArrowDown01Icon, "ChevronDown");
export const ChevronLeft = hugeicon(ArrowLeft01Icon, "ChevronLeft");
export const ChevronRight = hugeicon(ArrowRight01Icon, "ChevronRight");
export const ChevronUp = hugeicon(ArrowUp01Icon, "ChevronUp");
export const ChevronsUpDown = hugeicon(UnfoldMoreIcon, "ChevronsUpDown");
export const Circle = hugeicon(CircleIcon, "Circle");
export const ClipboardList = hugeicon(Task01Icon, "ClipboardList");
export const Clock = hugeicon(Clock01Icon, "Clock");
export const Code = hugeicon(SourceCodeIcon, "Code");
export const Code2 = hugeicon(CodeIcon, "Code2");
export const Compass = hugeicon(Compass01Icon, "Compass");
export const Copy = hugeicon(Copy01Icon, "Copy");
export const CreditCard = hugeicon(CreditCardIcon, "CreditCard");
export const Crosshair = hugeicon(Target01Icon, "Crosshair");
export const DollarSign = hugeicon(DollarCircleIcon, "DollarSign");
export const Download = hugeicon(Download04Icon, "Download");
export const Eraser = hugeicon(EraserIcon, "Eraser");
export const ExternalLink = hugeicon(LinkSquare02Icon, "ExternalLink");
export const Eye = hugeicon(ViewIcon, "Eye");
export const EyeOff = hugeicon(ViewOffSlashIcon, "EyeOff");
export const File = hugeicon(File01Icon, "File");
export const FileArchive = hugeicon(FileZipIcon, "FileArchive");
export const FileCheck = hugeicon(FileValidationIcon, "FileCheck");
export const FileDown = hugeicon(FileDownloadIcon, "FileDown");
export const FileIcon = hugeicon(File01Icon, "FileIcon");
export const FileImage = hugeicon(Image01Icon, "FileImage");
export const FileSpreadsheet = hugeicon(Xls01Icon, "FileSpreadsheet");
export const FileText = hugeicon(File01Icon, "FileText");
export const Filter = hugeicon(FilterIcon, "Filter");
export const Flag = hugeicon(Flag02Icon, "Flag");
export const Globe = hugeicon(Globe02Icon, "Globe");
export const Headphones = hugeicon(HeadphonesIcon, "Headphones");
export const History = hugeicon(WorkHistoryIcon, "History");
export const ImageOff = hugeicon(ImageNotFound01Icon, "ImageOff");
export const ImagePlus = hugeicon(ImageAdd01Icon, "ImagePlus");
export const Inbox = hugeicon(InboxIcon, "Inbox");
export const Info = hugeicon(InformationCircleIcon, "Info");
export const Italic = hugeicon(TextItalicIcon, "Italic");
export const KeyRound = hugeicon(Key01Icon, "KeyRound");
export const Layers = hugeicon(Layers01Icon, "Layers");
export const LayoutDashboard = hugeicon(DashboardSquare01Icon, "LayoutDashboard");
export const LayoutPanelLeft = hugeicon(LayoutLeftIcon, "LayoutPanelLeft");
export const Lightbulb = hugeicon(BulbIcon, "Lightbulb");
export const Link = hugeicon(Link01Icon, "Link");
export const Link2 = hugeicon(Link02Icon, "Link2");
export const List = hugeicon(LeftToRightListBulletIcon, "List");
export const ListOrdered = hugeicon(LeftToRightListNumberIcon, "ListOrdered");
export const Loader2 = hugeicon(Loading03Icon, "Loader2");
export const Lock = hugeicon(SquareLock02Icon, "Lock");
export const LogOut = hugeicon(Logout03Icon, "LogOut");
export const Mail = hugeicon(Mail01Icon, "Mail");
export const MapPin = hugeicon(Location01Icon, "MapPin");
export const Maximize2 = hugeicon(Maximize01Icon, "Maximize2");
export const MessageCircle = hugeicon(BubbleChatIcon, "MessageCircle");
export const MessageSquare = hugeicon(Message01Icon, "MessageSquare");
export const Mic = hugeicon(Mic01Icon, "Mic");
export const Minimize2 = hugeicon(Minimize01Icon, "Minimize2");
export const Monitor = hugeicon(ComputerIcon, "Monitor");
export const Moon = hugeicon(Moon02Icon, "Moon");
export const MoreHorizontal = hugeicon(MoreHorizontalIcon, "MoreHorizontal");
export const Package = hugeicon(PackageIcon, "Package");
export const PackageCheck = hugeicon(PackageDeliveredIcon, "PackageCheck");
export const PackagePlus = hugeicon(PackageAddIcon, "PackagePlus");
export const PanelLeft = hugeicon(SidebarLeftIcon, "PanelLeft");
export const Paperclip = hugeicon(Attachment01Icon, "Paperclip");
export const Pause = hugeicon(PauseIcon, "Pause");
export const PenLine = hugeicon(PencilEdit02Icon, "PenLine");
export const Pencil = hugeicon(PencilEdit01Icon, "Pencil");
export const Phone = hugeicon(Call02Icon, "Phone");
export const PhoneCall = hugeicon(CallRinging02Icon, "PhoneCall");
export const Play = hugeicon(PlayIcon, "Play");
export const Plus = hugeicon(Add01Icon, "Plus");
export const Power = hugeicon(PowerServiceIcon, "Power");
export const QrCode = hugeicon(QrCodeIcon, "QrCode");
export const Quote = hugeicon(QuoteDownIcon, "Quote");
export const Receipt = hugeicon(Invoice01Icon, "Receipt");
export const RefreshCw = hugeicon(RefreshIcon, "RefreshCw");
export const RotateCw = hugeicon(RotateClockwiseIcon, "RotateCw");
export const Save = hugeicon(FloppyDiskIcon, "Save");
export const Search = hugeicon(Search01Icon, "Search");
export const Send = hugeicon(SentIcon, "Send");
export const Settings = hugeicon(Settings01Icon, "Settings");
export const Settings2 = hugeicon(Settings02Icon, "Settings2");
export const Share = hugeicon(Share08Icon, "Share");
export const Share2 = hugeicon(Share01Icon, "Share2");
export const ShieldAlert = hugeicon(ShieldEnergyIcon, "ShieldAlert");
export const ShieldCheck = hugeicon(SecurityCheckIcon, "ShieldCheck");
export const ShieldOff = hugeicon(SecurityBlockIcon, "ShieldOff");
export const ShoppingCart = hugeicon(ShoppingCart01Icon, "ShoppingCart");
export const Smile = hugeicon(SmileIcon, "Smile");
export const Sparkles = hugeicon(SparklesIcon, "Sparkles");
export const Star = hugeicon(StarIcon, "Star");
export const Store = hugeicon(Store01Icon, "Store");
export const StoreIcon = hugeicon(Store01Icon, "StoreIcon");
export const Strikethrough = hugeicon(TextStrikethroughIcon, "Strikethrough");
export const Sun = hugeicon(Sun03Icon, "Sun");
export const Tag = hugeicon(Tag01Icon, "Tag");
export const Tags = hugeicon(Tag02Icon, "Tags");
export const Target = hugeicon(Target02Icon, "Target");
export const Timer = hugeicon(Timer02Icon, "Timer");
export const Trash2 = hugeicon(Delete02Icon, "Trash2");
export const TrendingUp = hugeicon(ChartIncreaseIcon, "TrendingUp");
export const Truck = hugeicon(DeliveryTruck01Icon, "Truck");
export const Underline = hugeicon(TextUnderlineIcon, "Underline");
export const Undo2 = hugeicon(Undo02Icon, "Undo2");
export const Upload = hugeicon(Upload04Icon, "Upload");
export const User = hugeicon(UserIcon, "User");
export const UserCheck = hugeicon(UserCheck01Icon, "UserCheck");
export const UserPlus = hugeicon(UserAdd01Icon, "UserPlus");
export const Users = hugeicon(UserGroupIcon, "Users");
export const Users2 = hugeicon(UserMultipleIcon, "Users2");
export const Wallet = hugeicon(Wallet01Icon, "Wallet");
export const Wand2 = hugeicon(MagicWand01Icon, "Wand2");
export const Warehouse = hugeicon(WarehouseIcon, "Warehouse");
export const Webhook = hugeicon(WebhookIcon, "Webhook");
export const Wrench = hugeicon(Wrench01Icon, "Wrench");
export const X = hugeicon(Cancel01Icon, "X");
export const XCircle = hugeicon(CancelCircleIcon, "XCircle");
