import {
  UserRound,Phone,Eye,LockKeyhole,Camera,IdCard,Check,ChevronLeft,ChevronRight,
  Bell,BellRing,Trash2,Info,BookOpen,University,CalendarDays,Clock,Star,
  Briefcase,Award,ShieldCheck,ArrowRight,Tag,GraduationCap,Pencil,LogOut,
  LayoutDashboard,AlertTriangle,RefreshCw,ClipboardList,Users,Menu,X,Search,
  PanelLeft,Terminal,Plus,KeyRound,Settings,Inbox,MessageCircle,Layers,List,UserCheck,CheckCircle,UserRoundPlus,CheckCheck
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const icons = {
  user:UserRound,phone:Phone,eye:Eye,lock:LockKeyhole,camera:Camera,id:IdCard,
  check:Check,chevronLeft:ChevronLeft,chevronRight:ChevronRight,bell:Bell,
  bellRing:BellRing,trash:Trash2,info:Info,book:BookOpen,university:University,
  calendar:CalendarDays,clock:Clock,star:Star,briefcase:Briefcase,
  certificate:Award,shield:ShieldCheck,arrow:ArrowRight,tag:Tag,
  graduation:GraduationCap,pencil:Pencil,logout:LogOut,dashboard:LayoutDashboard,
  alert:AlertTriangle,refresh:RefreshCw,audit:ClipboardList,users:Users,
  menu:Menu,close:X,search:Search,sidebar:PanelLeft,
  terminal:Terminal,plus:Plus,key:KeyRound,
  settings:Settings,academic:GraduationCap,inbox:Inbox,messages:MessageCircle,
  edit:Pencil,list:List,"id-card":IdCard,"user-check":UserCheck,layers:Layers,
  complete:CheckCircle, message:MessageCircle, request:UserRoundPlus,"double-check":CheckCheck,
} satisfies Record<string,LucideIcon>;

export type IconName = keyof typeof icons;

export function Icon({name,className="h-5 w-5"}:{name:IconName;className?:string}) {
  const IconComponent=icons[name];
  return <IconComponent aria-hidden="true" className={className} strokeWidth={1.7}/>;
}