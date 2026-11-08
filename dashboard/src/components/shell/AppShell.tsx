"use client";

import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Image from "next/image";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { useDashboard } from "@/components/DashboardProvider";
import { useAlerts } from "@/components/pages/useAlerts";
import { Icon } from "@/components/shell/icons";
import { DRAWER_WIDTH, isActiveHref, NAV_SECTIONS, OVERVIEW, SHELL_USER, TOP_BAR_HEIGHT, type NavItem } from "@/components/shell/nav";
import { useFilters } from "@/components/shell/useFilters";
import { AUDIENCE_LABEL, type AudienceFilter } from "@/lib/filters";
import { dateLabel, monthLabel } from "@/lib/format";

/**
 * Dashboard shell, after the BoothIQ layout: a persistent labelled sidebar
 * (logo block, grouped navigation with a tinted active pill, person footer),
 * a sticky top bar carrying the global scope (audience) and period (month)
 * controls plus data provenance, and the page content in <main>. Below the
 * `lg` breakpoint the sidebar becomes a modal drawer behind a menu button.
 */

const ACTIVE_BG = "rgba(113, 151, 122, 0.14)";

function NavLink({ item, pathname, href, onNavigate, badge }: { item: NavItem; pathname: string; href: string; onNavigate: () => void; badge?: number }) {
  const active = isActiveHref(pathname, item.href);
  return (
    <ListItem disablePadding sx={{ mb: 0.25 }}>
      <ListItemButton
        component={NextLink}
        href={href}
        onClick={onNavigate}
        selected={active}
        aria-current={active ? "page" : undefined}
        sx={{
          borderRadius: 2,
          px: 1.5,
          py: 1,
          color: "text.secondary",
          "&:hover": { bgcolor: "action.hover", color: "text.primary" },
          "&.Mui-selected": { bgcolor: ACTIVE_BG, color: "text.primary", "& .MuiListItemText-primary": { fontWeight: 600 } },
          "&.Mui-selected:hover": { bgcolor: ACTIVE_BG },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36, color: active ? "text.primary" : "text.secondary" }}>
          <Icon name={item.icon} />
        </ListItemIcon>
        <ListItemText primary={item.name} slotProps={{ primary: { variant: "body2", noWrap: true } }} />
        {badge ? <Chip size="small" color="warning" label={badge} aria-label={`${badge} alerts`} sx={{ height: 20, minWidth: 24, fontSize: "0.6875rem", fontWeight: 600 }} /> : null}
      </ListItemButton>
    </ListItem>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="subtitle2" color="text.secondary" sx={{ px: 1.5, pb: 0.5, pt: 1.5, fontSize: "0.6875rem" }}>
      {children}
    </Typography>
  );
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const { linkTo } = useFilters();
  const { alerts } = useAlerts();
  const attention = alerts.filter((a) => a.severity !== "info").length;
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "background.paper" }}>
      <Box sx={{ height: TOP_BAR_HEIGHT, px: 2.5, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <NextLink href={linkTo("/")} onClick={onNavigate} aria-label="Biofarm marketing dashboard, overview" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image src="/biofarm-wordmark.png" alt="" width={126} height={24} priority style={{ height: 22, width: "auto" }} />
          <Typography variant="caption" sx={{ color: "text.secondary", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, pt: "2px" }}>
            Marketing
          </Typography>
        </NextLink>
      </Box>

      <Box component="nav" aria-label="Primary" sx={{ flex: 1, overflowY: "auto", px: 1.5, py: 1.5 }}>
        <List disablePadding>
          <NavLink item={OVERVIEW} pathname={pathname} href={linkTo(OVERVIEW.href)} onNavigate={onNavigate} />
        </List>
        {NAV_SECTIONS.map((section) => (
          <List key={section.title} disablePadding subheader={<SectionLabel>{section.title}</SectionLabel>}>
            {section.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} href={linkTo(item.href)} onNavigate={onNavigate} badge={item.href === "/alerts" ? attention : undefined} />
            ))}
          </List>
        ))}
      </Box>

      <Box sx={{ borderTop: 1, borderColor: "divider", p: 1.5 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", p: 1 }}>
          <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main", color: "primary.contrastText", fontSize: "0.8125rem", fontWeight: 600 }}>{SHELL_USER.initials}</Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
              {SHELL_USER.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
              {SHELL_USER.role} · no sign-in yet
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

function AudienceSwitcher() {
  const { filters, setFilters } = useFilters();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const id = useId();
  const current = AUDIENCE_LABEL[filters.audience];
  const open = Boolean(anchor);

  const choose = (audience: AudienceFilter) => {
    setAnchor(null);
    if (audience !== filters.audience) setFilters({ audience });
  };

  return (
    <>
      <Button
        id={`${id}-button`}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={open || undefined}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={`Audience: ${current.title}`}
        color="inherit"
        variant="outlined"
        sx={{ borderColor: "divider", px: 1.25, py: 0.75, gap: 1.25, textAlign: "left", fontWeight: 400, minWidth: 0 }}
      >
        <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: ACTIVE_BG, display: "grid", placeItems: "center", color: "text.primary", flexShrink: 0 }} aria-hidden="true">
          <Icon name="users" size={16} />
        </Box>
        <Box sx={{ minWidth: 0, display: { xs: "none", sm: "block" } }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 500, lineHeight: 1.2 }}>
            {current.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", lineHeight: 1.2 }}>
            {current.detail}
          </Typography>
        </Box>
        <Box sx={{ color: "text.secondary", transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} aria-hidden="true">
          <Icon name="chevronDown" size={16} />
        </Box>
      </Button>
      <Menu id={`${id}-menu`} anchorEl={anchor} open={open} onClose={() => setAnchor(null)} slotProps={{ list: { "aria-labelledby": `${id}-button` }, paper: { sx: { minWidth: 260, mt: 0.75 } } }}>
        {(Object.keys(AUDIENCE_LABEL) as AudienceFilter[]).map((key) => {
          const option = AUDIENCE_LABEL[key];
          const selected = key === filters.audience;
          return (
            <MenuItem key={key} selected={selected} onClick={() => choose(key)} sx={{ py: 1, gap: 1.5 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {option.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {option.detail}
                </Typography>
              </Box>
              {selected && (
                <Box sx={{ color: "text.primary" }} aria-hidden="true">
                  <Icon name="check" size={16} />
                </Box>
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

function MonthSelect() {
  const { filters, setFilters, months } = useFilters();
  const id = useId();
  return (
    <TextField
      select
      size="small"
      label="Month"
      id={`${id}-month`}
      value={filters.month}
      onChange={(e) => setFilters({ month: e.target.value })}
      slotProps={{ select: { native: true } }}
      sx={{ minWidth: 150, "& .MuiInputBase-root": { bgcolor: "background.paper" } }}
    >
      {[...months].reverse().map((m) => (
        <option key={m} value={m}>
          {monthLabel(m)}
        </option>
      ))}
    </TextField>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data } = useDashboard();
  const { linkTo } = useFilters();
  const { alerts } = useAlerts();
  const attention = alerts.filter((a) => a.severity !== "info").length;
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <Box
        component="a"
        href="#dashboard-content"
        sx={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: (t) => t.zIndex.modal + 1,
          px: 1.5,
          py: 1,
          borderRadius: 1.5,
          bgcolor: "secondary.main",
          color: "#fff",
          fontSize: "0.875rem",
          fontWeight: 500,
          transform: "translateY(-200%)",
          "&:focus-visible": { transform: "none", outline: "2px solid", outlineColor: "primary.main" },
        }}
      >
        Skip to content
      </Box>

      <Box component="aside" sx={{ width: { lg: DRAWER_WIDTH }, flexShrink: 0 }}>
        <Drawer
          variant="temporary"
          open={drawerOpen}
          onClose={closeDrawer}
          aria-label="Navigation"
          sx={{ display: { xs: "block", lg: "none" } }}
          slotProps={{ paper: { sx: { width: DRAWER_WIDTH, boxSizing: "border-box" } } }}
        >
          <Sidebar onNavigate={closeDrawer} />
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: "none", lg: "block" },
            "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box", borderRight: "1px solid", borderColor: "divider" },
          }}
        >
          <Sidebar onNavigate={() => {}} />
        </Drawer>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}
        >
          <Toolbar disableGutters sx={{ minHeight: `${TOP_BAR_HEIGHT}px !important`, gap: 1.5, px: { xs: 2, md: 3 } }}>
            <IconButton onClick={() => setDrawerOpen(true)} aria-label="Open navigation" aria-expanded={drawerOpen} edge="start" sx={{ display: { lg: "none" }, color: "text.secondary" }}>
              <Icon name="menu" size={24} />
            </IconButton>
            <AudienceSwitcher />
            <MonthSelect />
            <Box sx={{ flex: 1 }} />
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {data.source === "demo" && <Chip label="Demo data" color="warning" variant="outlined" size="small" />}
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", md: "block" }, whiteSpace: "nowrap" }}>
                synced {dateLabel(data.syncedAt)}
              </Typography>
              <Tooltip title={attention ? `${attention} alerts need attention` : "Alerts"}>
                <IconButton component={NextLink} href={linkTo("/alerts")} aria-label={attention ? `Alerts, ${attention} need attention` : "Alerts"} sx={{ color: "text.secondary" }}>
                  <Badge color="warning" variant="dot" invisible={!attention}>
                    <Icon name="bell" size={22} />
                  </Badge>
                </IconButton>
              </Tooltip>
              <Tooltip title="What counts as a qualified opportunity">
                <IconButton component={NextLink} href={linkTo("/kpi-rule")} aria-label="KPI rule" sx={{ color: "text.secondary" }}>
                  <Icon name="help" size={22} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Toolbar>
        </AppBar>

        {data.source === "demo" && (
          <Alert severity="warning" role="status" icon={false} data-print="hide" sx={{ borderRadius: 0, justifyContent: "center", py: 0, "& .MuiAlert-message": { py: 0.75 } }}>
            Demo data: the numbers are generated, not real. This notice goes once live data is connected.
          </Alert>
        )}
        <Box component="main" id="dashboard-content" tabIndex={-1} sx={{ flex: 1, p: { xs: 2, md: 3 }, outline: "none", maxWidth: 1440, width: "100%", mx: "auto" }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
