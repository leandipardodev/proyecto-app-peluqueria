export type BookingThemeKey = "minimal-light" | "carbon-glass" | "editorial-cream" | "pastel-colorful";

export interface BookingTheme {
  isDark: boolean;
  page: string;
  pageAura: string;
  pageLightFx: string;
  glowBlend: string;
  motionPreset: string;
  shell: string;
  heading: string;
  headingFx: string;
  titleGradient: string;
  subtitleGradient: string;
  tiny: string;
  accent: string;
  selected: string;
  plain: string;
  sectionChip: string;
  sectionChipActive: string;
  sectionFocus: string;
  sectionTag: string;
  sectionTagActive: string;
  sectionTagAll: string;
  hoverBorder: string;
  progressDone: string;
  progressCurrent: string;
  progressPending: string;
  progressShell: string;
  progressTrack: string;
  progressFill: string;
  progressStepDone: string;
  progressStepActive: string;
  progressStepIdle: string;
  divider: string;
  ctaMain: string;
  ctaDepth: string;
  next: string;
  nextDisabled: string;
  label: string;
  input: string;
  back: string;
  doneTitle: string;
  doneText: string;
  meta: string;
  metaHover: string;
  footer: string;
  footerText: string;
  glowA: string;
  glowB: string;
  glowC: string;
  plate: string;
  cardDepth: string;
  scrollFade: string;
  line: string;
  skeleton: string;
  successChip: string;
  warningBox: string;
  errorBox: string;
  checkout: string;
  checkoutKicker: string;
  checkoutTitle: string;
  checkoutAmount: string;
  checkoutBadge: string;
  checkoutWallet: string;
  checkoutLink: string;
  calendar: string;
  checkoutOrbA: string;
  checkoutOrbB: string;
  priceText: string;
  priceFx: string;
  pricePill: string;
  ghostBtn: string;
}

export const BOOKING_THEMES: Record<BookingThemeKey, BookingTheme> = {
  "minimal-light": {
    isDark: false,
    page: "bg-[#EEF4FF] text-[#1C1C1E]",
    pageAura: "from-[#cfe1ff] via-[#f5faff] to-[#dffbee]",
    pageLightFx: "[background:radial-gradient(circle_at_12%_16%,rgba(118,167,255,0.48),transparent_38%),radial-gradient(circle_at_88%_84%,rgba(85,211,177,0.38),transparent_34%),radial-gradient(circle_at_58%_40%,rgba(165,194,255,0.26),transparent_42%)]",
    glowBlend: "mix-blend-multiply",
    motionPreset: "airy",
    shell: "bg-white border border-[#cfdcec] shadow-[0_28px_90px_-45px_rgba(7,13,32,0.32)]",
    heading: "text-[#111114]",
    headingFx: "drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]",
    titleGradient: "from-[#0f172a] via-[#2c61b8] to-[#60a5fa]",
    subtitleGradient: "from-[#4f6584] via-[#6c8ec0] to-[#5fa7c6]",
    tiny: "text-[#5A6472]",
    accent: "text-[#0071E3]",
    selected: "bg-white border-[#111114]/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_20px_35px_-25px_rgba(0,113,227,0.55)]",
    plain: "bg-white border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
    sectionChip: "bg-white border-[#d4deea] text-[#4f6078] hover:border-[#8fb3ef]",
    sectionChipActive: "bg-[#eef5ff] border-[#78a7f0] text-[#1f56a8] shadow-[0_14px_28px_-20px_rgba(15,95,204,0.5)]",
    sectionFocus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ca2f1]/55 focus-visible:ring-offset-1 focus-visible:ring-offset-white/70",
    sectionTag: "bg-white text-[#5b6a80] hover:bg-[#eef2f7]",
    sectionTagActive: "bg-[#e8f2ff] text-[#1f56a8] font-semibold",
    sectionTagAll: "bg-transparent text-[#7f8ea5] hover:text-[#4b5d79]",
    hoverBorder: "hover:border-[#0071E3]/35",
    progressDone: "bg-[#0071E3]",
    progressCurrent: "bg-[#0071E3]/65",
    progressPending: "bg-[#D2D2D7]",
    progressShell: "bg-white border-black/10 shadow-[0_16px_36px_-22px_rgba(15,23,42,0.24)]",
    progressTrack: "bg-[#ced8e6]",
    progressFill: "bg-gradient-to-r from-[#0f5fcc] to-[#66a5ff]",
    progressStepDone: "bg-[#e7f1ff] text-[#1b5ab8] border-[#b9d3ff]",
    progressStepActive: "bg-[#0f5fcc] text-white border-[#5f9fff] shadow-[0_10px_22px_-14px_rgba(15,95,204,0.7)]",
    progressStepIdle: "bg-white text-[#6b778a] border-[#d3dbe8]",
    divider: "bg-black/10",
    ctaMain: "bg-[#111114] text-white",
    ctaDepth: "shadow-[0_18px_34px_-18px_rgba(7,13,32,0.55),inset_0_1px_0_rgba(255,255,255,0.2)]",
    next: "bg-[#111114] text-white hover:bg-black",
    nextDisabled: "bg-[#d5deea] text-[#7a8798]",
    label: "text-zinc-700",
    input: "w-full rounded-full bg-white border border-[#D2D2D7] pl-10 pr-4 py-2.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40 transition-all",
    back: "border border-[#cfd8e6] bg-white text-[#46566e] hover:bg-white",
    doneTitle: "text-[#1D1D1F]",
    doneText: "text-[#86868B]",
    meta: "text-[#86868B]",
    metaHover: "hover:text-[#1D1D1F]",
    footer: "bg-white border-white/80",
    footerText: "text-[#1D1D1F]",
    glowA: "bg-[#6aa6ff]/70",
    glowB: "bg-[#72e2c0]/62",
    glowC: "bg-[#9db9ff]/58",
    plate: "bg-white border-black/5",
    cardDepth: "shadow-[0_18px_42px_-24px_rgba(15,23,42,0.3),inset_0_1px_0_rgba(255,255,255,0.75)]",
    scrollFade: "#ffffff",
    line: "border-black/10",
    skeleton: "bg-black/5 border-black/10",
    successChip: "bg-emerald-50/90 border-emerald-200 text-emerald-800",
    warningBox: "bg-amber-100/60 border-amber-300/40 text-amber-900",
    errorBox: "bg-rose-100/70 border-rose-300/40 text-rose-900",
    checkout: "bg-white border-black/10",
    checkoutKicker: "text-[#44566F]",
    checkoutTitle: "text-[#111114]",
    checkoutAmount: "text-[#111114]",
    checkoutBadge: "border-[#A8C7E9] bg-[#EAF3FF] text-[#1A4B7A]",
    checkoutWallet: "border-black/10 bg-white",
    checkoutLink: "border-black/15 bg-white text-[#1D1D1F] hover:bg-white",
    calendar: "bg-[#0071E3] text-white hover:bg-[#0062c6]",
    checkoutOrbA: "bg-[#8bb9ff]/35",
    checkoutOrbB: "bg-[#8de4cc]/30",
    priceText: "text-[1.58rem] sm:text-[1.8rem] font-bold tracking-[-0.03em] font-['SF_Pro_Display','Segoe_UI','Inter','system-ui',sans-serif]",
    priceFx: "text-[#0c4a98] drop-shadow-[0_10px_22px_rgba(15,79,163,0.28)]",
    pricePill: "border-[#b9cade] bg-white text-[#41526a]",
    ghostBtn: "border-[#cfd8e6] bg-white text-[#2a3950] hover:bg-white",
  },
  "carbon-glass": {
    isDark: true,
    page: "bg-[#05070D] text-[#F5F5F7]",
    pageAura: "from-[#0a1a33] via-[#070c17] to-[#122746]",
    pageLightFx: "[background:radial-gradient(circle_at_14%_14%,rgba(55,122,230,0.42),transparent_42%),radial-gradient(circle_at_86%_82%,rgba(41,90,175,0.36),transparent_38%),radial-gradient(circle_at_55%_44%,rgba(76,135,234,0.2),transparent_46%)]",
    glowBlend: "mix-blend-screen",
    motionPreset: "cinematic",
    shell: "bg-zinc-900 border border-[#2a3448] shadow-[0_28px_90px_-40px_rgba(0,0,0,0.9)]",
    heading: "text-[#FAFAFA]",
    headingFx: "drop-shadow-[0_1px_10px_rgba(122,184,255,0.2)]",
    titleGradient: "from-[#e5edf9] via-[#88bcff] to-[#e7f2ff]",
    subtitleGradient: "from-[#9fb2cf] via-[#88bcff] to-[#d2e4ff]",
    tiny: "text-[#A6AAB3]",
    accent: "text-[#7AB8FF]",
    selected: "bg-white/12 border-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_22px_38px_-26px_rgba(88,153,255,0.5)]",
    plain: "bg-white/[0.04] border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
    sectionChip: "bg-[#0f1b2e]/90 border-[#2c4163] text-[#9db2cf] hover:border-[#6eaaf8]",
    sectionChipActive: "bg-[#122745] border-[#6eaaf8] text-[#d7eaff] shadow-[0_14px_28px_-20px_rgba(84,153,255,0.6)]",
    sectionFocus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ab8ff]/55 focus-visible:ring-offset-1 focus-visible:ring-offset-[#091322]",
    sectionTag: "bg-[#0f1b2e]/95 text-[#9fb5d3] hover:bg-[#13213a]",
    sectionTagActive: "bg-[#17325a] text-[#dcecff] font-semibold",
    sectionTagAll: "bg-transparent text-[#768aa8] hover:text-[#b9d0f1]",
    hoverBorder: "hover:border-[#7AB8FF]/55",
    progressDone: "bg-[#7AB8FF]",
    progressCurrent: "bg-[#7AB8FF]/70",
    progressPending: "bg-white/15",
    progressShell: "bg-[#0d1626]/60 border-[#2a3750] shadow-[0_20px_42px_-24px_rgba(0,0,0,0.9)]",
    progressTrack: "bg-[#25344f]",
    progressFill: "bg-gradient-to-r from-[#4e94ff] to-[#8ac1ff]",
    progressStepDone: "bg-[#11213b] text-[#9fc8ff] border-[#2d4f7d]",
    progressStepActive: "bg-[#7ab8ff] text-[#061224] border-[#a7d0ff] shadow-[0_12px_24px_-16px_rgba(122,184,255,0.75)]",
    progressStepIdle: "bg-[#0f1b2e]/75 text-[#7f8fa8] border-[#2a3750]",
    divider: "bg-white/15",
    ctaMain: "bg-white text-black",
    ctaDepth: "shadow-[0_20px_42px_-20px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.8)]",
    next: "bg-white text-black hover:bg-zinc-200",
    nextDisabled: "bg-[#2a3448] text-[#7f8ba1]",
    label: "text-zinc-200",
    input: "w-full rounded-full bg-white border border-[#D2D2D7] pl-10 pr-4 py-2.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40 transition-all",
    back: "border border-[#2c3f5f] bg-[#111c2d]/80 text-[#bad2f3] hover:bg-[#15253d]",
    doneTitle: "text-white",
    doneText: "text-zinc-400",
    meta: "text-zinc-400",
    metaHover: "hover:text-zinc-100",
    footer: "bg-zinc-900 border-white/15",
    footerText: "text-neutral-100",
    glowA: "bg-[#2f74d8]/62",
    glowB: "bg-[#183f76]/58",
    glowC: "bg-[#4e8cf2]/46",
    plate: "bg-neutral-900/30 border-white/10",
    cardDepth: "shadow-[0_24px_46px_-24px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.14)]",
    scrollFade: "#18181b",
    line: "border-white/15",
    skeleton: "bg-white/10 border-white/10",
    successChip: "bg-emerald-400/10 border-emerald-300/20 text-emerald-100",
    warningBox: "bg-amber-500/10 border-amber-300/20 text-amber-200",
    errorBox: "bg-red-500/10 border-red-300/20 text-red-200",
    checkout: "bg-neutral-900/35 border-white/15",
    checkoutKicker: "text-sky-100/70",
    checkoutTitle: "text-white",
    checkoutAmount: "text-white",
    checkoutBadge: "border-emerald-300/40 bg-emerald-400/15 text-emerald-100",
    checkoutWallet: "border-white/15 bg-white p-2",
    checkoutLink: "border-white/25 bg-white/12 text-white hover:bg-white/20",
    calendar: "bg-[#7AB8FF] text-black hover:bg-[#95c6ff]",
    checkoutOrbA: "bg-[#62a6ff]/30",
    checkoutOrbB: "bg-[#74c8ff]/22",
    priceText: "text-[1.58rem] sm:text-[1.8rem] font-bold tracking-[-0.03em] font-['SF_Pro_Display','Segoe_UI','Inter','system-ui',sans-serif]",
    priceFx: "text-[#b1d5ff] drop-shadow-[0_12px_24px_rgba(122,184,255,0.34)]",
    pricePill: "border-white/20 bg-white/10 text-[#c7d6eb]",
    ghostBtn: "border-[#2f4466] bg-[#101c2d]/85 text-[#c5daf6] hover:bg-[#172940]",
  },
  "editorial-cream": {
    isDark: false,
    page: "bg-[#f9f1e7] text-[#2E221A]",
    pageAura: "from-[#efd4b7] via-[#fff6ec] to-[#e7c6a7]",
    pageLightFx: "[background:radial-gradient(circle_at_12%_18%,rgba(219,152,91,0.38),transparent_40%),radial-gradient(circle_at_88%_80%,rgba(207,137,74,0.32),transparent_36%),radial-gradient(circle_at_54%_46%,rgba(237,185,135,0.24),transparent_44%)]",
    glowBlend: "mix-blend-multiply",
    motionPreset: "elegant",
    shell: "bg-amber-50 border border-[#ddc7b0] shadow-[0_28px_80px_-45px_rgba(121,89,45,0.28)]",
    heading: "text-[#2E221A]",
    headingFx: "drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]",
    titleGradient: "from-[#39281b] via-[#8a5f39] to-[#d3a47a]",
    subtitleGradient: "from-[#765740] via-[#9e7047] to-[#bf8e63]",
    tiny: "text-[#7A6855]",
    accent: "text-[#1A1A1A]",
    selected: "bg-white border-[#B98850]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_20px_34px_-24px_rgba(163,112,58,0.45)]",
    plain: "bg-white border-[#D8D0C6]",
    sectionChip: "bg-[#fff9f2] border-[#dcc7b1] text-[#7b6652] hover:border-[#bb8b5f]",
    sectionChipActive: "bg-[#f8e9d7] border-[#b8875c] text-[#7a4f2f] shadow-[0_14px_28px_-20px_rgba(138,95,57,0.55)]",
    sectionFocus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8875c]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[#fff7ed]",
    sectionTag: "bg-[#fff9f2] text-[#7c6753] hover:bg-[#fff4e7]",
    sectionTagActive: "bg-[#f5e4d0] text-[#73492c] font-semibold",
    sectionTagAll: "bg-transparent text-[#907c67] hover:text-[#6f5640]",
    hoverBorder: "hover:border-[#B98850]/45",
    progressDone: "bg-[#7D5C3A]",
    progressCurrent: "bg-[#7D5C3A]/65",
    progressPending: "bg-[#D8D0C6]",
    progressShell: "bg-amber-50 border-[#d9c6b1] shadow-[0_18px_38px_-24px_rgba(121,89,45,0.28)]",
    progressTrack: "bg-[#dbc9b7]",
    progressFill: "bg-gradient-to-r from-[#8a5f39] to-[#c58a57]",
    progressStepDone: "bg-[#faeddc] text-[#7a5535] border-[#d9bc9e]",
    progressStepActive: "bg-[#8a5f39] text-[#fff3e5] border-[#be8a5f] shadow-[0_12px_26px_-16px_rgba(138,95,57,0.6)]",
    progressStepIdle: "bg-[#fffaf3] text-[#8a7865] border-[#dbcbb9]",
    divider: "bg-[#D8D0C6]",
    ctaMain: "bg-[#1A1A1A] text-[#F4F0EA]",
    ctaDepth: "shadow-[0_20px_38px_-22px_rgba(108,73,39,0.55),inset_0_1px_0_rgba(255,255,255,0.15)]",
    next: "bg-[#1A1A1A] text-[#F4F0EA] hover:bg-black",
    nextDisabled: "bg-[#dfd3c4] text-[#8a7863]",
    label: "text-[#4E453C]",
    input: "w-full rounded-full bg-[#FFFDF9] border border-[#D8D0C6] pl-10 pr-4 py-2.5 text-sm text-[#1A1A1A] placeholder-[#9A8D7E] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/20 transition-all",
    back: "border border-[#d7c5b1] bg-[#fff9f2] text-[#6a5845] hover:bg-[#fff3e6]",
    doneTitle: "text-[#1A1A1A]",
    doneText: "text-[#7A6F63]",
    meta: "text-[#7A6F63]",
    metaHover: "hover:text-[#1A1A1A]",
    footer: "bg-amber-50 border-[#D8D0C6]",
    footerText: "text-[#1A1A1A]",
    glowA: "bg-[#e4aa78]/62",
    glowB: "bg-[#ca8f63]/52",
    glowC: "bg-[#f2caa6]/50",
    plate: "bg-white border-stone-200/40",
    cardDepth: "shadow-[0_20px_40px_-24px_rgba(123,89,50,0.35),inset_0_1px_0_rgba(255,255,255,0.7)]",
    scrollFade: "#fffbeb",
    line: "border-stone-300/40",
    skeleton: "bg-stone-100/60 border-stone-300/35",
    successChip: "bg-emerald-50/80 border-emerald-200 text-emerald-800",
    warningBox: "bg-amber-100/70 border-amber-300/40 text-amber-900",
    errorBox: "bg-rose-100/70 border-rose-300/40 text-rose-900",
    checkout: "bg-white border-stone-200/50",
    checkoutKicker: "text-[#8C6D4C]",
    checkoutTitle: "text-[#2E221A]",
    checkoutAmount: "text-[#2E221A]",
    checkoutBadge: "border-[#D6B892] bg-[#F8E9D8] text-[#6A4A2D]",
    checkoutWallet: "border-stone-200/60 bg-white p-2",
    checkoutLink: "border-stone-300/55 bg-white text-[#2E221A] hover:bg-white",
    calendar: "bg-[#7D5C3A] text-white hover:bg-[#6a4d31]",
    checkoutOrbA: "bg-[#e8b88a]/30",
    checkoutOrbB: "bg-[#d9a774]/25",
    priceText: "text-[1.58rem] sm:text-[1.8rem] font-bold tracking-[-0.03em] font-['SF_Pro_Display','Segoe_UI','Inter','system-ui',sans-serif]",
    priceFx: "text-[#7a4f30] drop-shadow-[0_10px_22px_rgba(127,85,54,0.3)]",
    pricePill: "border-[#ceb79f] bg-[#fff8ef] text-[#715944]",
    ghostBtn: "border-[#d8c4af] bg-[#fff9f2] text-[#5f4d3a] hover:bg-[#fff2e4]",
  },
  "pastel-colorful": {
    isDark: false,
    page: "bg-[#eef2ff] text-[#2D3142]",
    pageAura: "from-[#bdd7ff] via-[#ffe2ec] to-[#cef3e7]",
    pageLightFx: "[background:radial-gradient(circle_at_14%_14%,rgba(137,167,255,0.45),transparent_40%),radial-gradient(circle_at_86%_80%,rgba(255,162,198,0.35),transparent_36%),radial-gradient(circle_at_56%_48%,rgba(129,223,187,0.3),transparent_44%)]",
    glowBlend: "mix-blend-multiply",
    motionPreset: "playful",
    shell: "bg-white border border-[#d7deef] shadow-[0_28px_90px_-42px_rgba(25,33,52,0.28)]",
    heading: "text-[#2D3142]",
    headingFx: "drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]",
    titleGradient: "from-[#2d3142] via-[#5f6dd8] to-[#f18fb7]",
    subtitleGradient: "from-[#667196] via-[#7f8de6] to-[#d487b5]",
    tiny: "text-[#677189]",
    accent: "text-[#5a72cd]",
    selected: "bg-white border-[#95A8E8]/55 shadow-[0_20px_38px_-24px_rgba(104,131,216,0.35)]",
    plain: "bg-white border-neutral-200/60",
    sectionChip: "bg-white border-[#d4ddef] text-[#6a7692] hover:border-[#8ca4e8]",
    sectionChipActive: "bg-[#eef1ff] border-[#8ca4e8] text-[#4b63bb] shadow-[0_14px_28px_-20px_rgba(97,125,214,0.55)]",
    sectionFocus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea5ea]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-white/70",
    sectionTag: "bg-white text-[#6a7693] hover:bg-[#f0f3fc]",
    sectionTagActive: "bg-[#e9edff] text-[#4a63b9] font-semibold",
    sectionTagAll: "bg-transparent text-[#818ca8] hover:text-[#566287]",
    hoverBorder: "hover:border-[#95A8E8]/60",
    progressDone: "bg-[#6883D8]",
    progressCurrent: "bg-[#6883D8]/65",
    progressPending: "bg-neutral-200",
    progressShell: "bg-white border-[#d6deee] shadow-[0_18px_36px_-22px_rgba(66,83,132,0.26)]",
    progressTrack: "bg-[#d7deef]",
    progressFill: "bg-gradient-to-r from-[#617dd6] to-[#ef95ba]",
    progressStepDone: "bg-[#edf1ff] text-[#546dc2] border-[#c5d1f0]",
    progressStepActive: "bg-[#617dd6] text-white border-[#9db1ec] shadow-[0_12px_26px_-16px_rgba(97,125,214,0.62)]",
    progressStepIdle: "bg-white text-[#7a85a0] border-[#d3dced]",
    divider: "bg-neutral-200",
    ctaMain: "bg-[#2D3142] text-white",
    ctaDepth: "shadow-[0_20px_38px_-20px_rgba(45,49,66,0.55),inset_0_1px_0_rgba(255,255,255,0.18)]",
    next: "bg-[#2D3142] text-white hover:bg-[#23293A]",
    nextDisabled: "bg-[#d7deea] text-[#8791a8]",
    label: "text-[#3A3F53]",
    input: "w-full rounded-full bg-white border border-[#D2D2D7] pl-10 pr-4 py-2.5 text-sm text-[#2D3142] placeholder-[#8A91A6] focus:outline-none focus:ring-2 focus:ring-[#8FB1E8]/45 transition-all",
    back: "border border-[#d0dbec] bg-white text-[#4f5c79] hover:bg-white",
    doneTitle: "text-[#2D3142]",
    doneText: "text-[#677189]",
    meta: "text-[#677189]",
    metaHover: "hover:text-[#2D3142]",
    footer: "bg-white border-neutral-200/65",
    footerText: "text-[#2D3142]",
    glowA: "bg-[#9ebdff]/66",
    glowB: "bg-[#ffb8d2]/62",
    glowC: "bg-[#a9e9cf]/58",
    plate: "bg-white border-neutral-200/50",
    cardDepth: "shadow-[0_20px_40px_-24px_rgba(66,83,132,0.34),inset_0_1px_0_rgba(255,255,255,0.78)]",
    scrollFade: "#ffffff",
    line: "border-neutral-200/60",
    skeleton: "bg-white border-neutral-200/70",
    successChip: "bg-emerald-50/90 border-emerald-200 text-emerald-800",
    warningBox: "bg-amber-100/70 border-amber-300/40 text-amber-900",
    errorBox: "bg-rose-100/75 border-rose-300/45 text-rose-900",
    checkout: "bg-white border-neutral-200/60",
    checkoutKicker: "text-[#6C7A97]",
    checkoutTitle: "text-[#2D3142]",
    checkoutAmount: "text-[#2D3142]",
    checkoutBadge: "border-[#B7C4EC] bg-[#EEF2FF] text-[#4E63A8]",
    checkoutWallet: "border-neutral-200/70 bg-white p-2",
    checkoutLink: "border-neutral-300/70 bg-white text-[#2D3142] hover:bg-white",
    calendar: "bg-[#6883D8] text-white hover:bg-[#5673cb]",
    checkoutOrbA: "bg-[#b7c7ff]/35",
    checkoutOrbB: "bg-[#ffc8dc]/30",
    pricePill: "text-[#5f6c8a]",
    priceText: "text-[1.58rem] sm:text-[1.8rem] font-bold tracking-[-0.03em] font-['SF_Pro_Display','Segoe_UI','Inter','system-ui',sans-serif]",
    priceFx: "text-[#4c60be] drop-shadow-[0_10px_22px_rgba(82,102,194,0.3)]",
    ghostBtn: "border-[#cfdaec] bg-white text-[#4f5f80] hover:bg-white",
  },
};

export function resolveTemplate(templateId: string): BookingThemeKey {
  if (templateId === "classic-dark") return "carbon-glass";
  if (templateId === "editorial-luxury") return "editorial-cream";
  if (templateId === "street-bold") return "pastel-colorful";
  return "minimal-light";
}
