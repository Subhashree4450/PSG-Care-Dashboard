import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import "./Dashboard.css";

const API_BASE = "https://psg-care-backend.onrender.com/api/dashboard";
const REFRESH_INTERVAL = 30000; // 30 seconds

// ── Utility helpers ──────────────────────────────────────────────────────────

const formatProvidedTime = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  let hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day} ${month} ${year}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
};

const formatRealTime = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const isInsideLab = (entry) => {
  if (!entry.outTime || entry.outTime === "" || entry.outTime === null) return true;
  const fakeNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return new Date(entry.outTime) > fakeNow;
};

const getDuration = (inTime, outTime) => {
  const fakeNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  let end = outTime;
  let ongoing = false;
  
  if (!outTime || outTime === "" || outTime === null || new Date(outTime) > fakeNow) {
    end = fakeNow;
    ongoing = true;
  }
  
  const diff = new Date(end) - new Date(inTime);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m${ongoing ? " (ongoing)" : ""}`;
  
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m${ongoing ? " (ongoing)" : ""}`;
};

// ── Sub-components ────────────────────────────────────────────────────────────

// Monochrome SVG icons for stat cards
const IconPeople = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconWeek = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <path d="M8 14h.01M12 14h.01M16 14h.01"/>
  </svg>
);
const IconLab = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11l-4 6h14l-4-6V3"/>
  </svg>
);
const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const StatCard = ({ icon, label, value, color, sublabel, onClick, active }) => (
  <div 
    className={`stat-card stat-card--${color} ${active ? 'stat-card--active' : ''} ${onClick ? 'stat-card--clickable' : ''}`}
    onClick={onClick}
    role={onClick ? "button" : undefined}
  >
    <div className="stat-card__icon-wrap">
      {icon}
    </div>
    <div className="stat-card__body">
      <span className="stat-card__value">{value}</span>
      <span className="stat-card__label">{label}</span>
      {sublabel && <span className="stat-card__sublabel">{sublabel}</span>}
    </div>
  </div>
);

const DeptBar = ({ name, count, max, onClick, active }) => {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div 
      className={`dept-bar ${active ? "dept-bar--active" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={`Filter by ${name}`}
    >
      <div className="dept-bar__header">
        <span className="dept-bar__name">{name}</span>
        <span className="dept-bar__count">{count}</span>
      </div>
      <div className="dept-bar__track">
        <div
          className="dept-bar__fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const StatusBadge = ({ inside }) => (
  <span className={`badge ${inside ? "badge--inside" : "badge--left"}`}>
    {inside ? "● In Lab" : "✓ Left"}
  </span>
);

const Spinner = () => (
  <div className="spinner-wrap">
    <div className="spinner" />
  </div>
);

const EmptyState = ({ message }) => (
  <div className="empty-state">
    <span className="empty-state__icon">📋</span>
    <p>{message || "No records found."}</p>
  </div>
);

// ── Main Dashboard ─────────────────────────────────────────────────────────────

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const [clock, setClock] = useState(new Date());

  const [filters, setFilters] = useState({
    search: "",
    department: "",
    dateFrom: "",
    dateTo: "",
    status: "",
    page: 1,
    limit: 15,
    sortBy: "inTime",
    sortOrder: "desc",
  });

  const [expandedRow, setExpandedRow] = useState(null);
  const countdownRef = useRef(null);
  const refreshTimerRef = useRef(null);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/stats`);
      setStats(res.data);
    } catch (err) {
      setError("Failed to load stats. Check your connection.");
    }
  }, []);

  // Fetch departments for filter dropdown
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/departments`);
      setDepartments(res.data.departments || []);
    } catch (_) {}
  }, []);

  // Fetch paginated entries
  const fetchEntries = useCallback(async (f) => {
    setTableLoading(true);
    try {
      const params = {
        page: f.page,
        limit: f.limit,
        sortBy: f.sortBy,
        sortOrder: f.sortOrder,
        ...(f.search && { search: f.search }),
        ...(f.department && { department: f.department }),
        ...(f.dateFrom && { dateFrom: f.dateFrom }),
        ...(f.dateTo && { dateTo: f.dateTo }),
        ...(f.status && { status: f.status }),
      };
      const res = await axios.get(`${API_BASE}/entries`, { params });
      setEntries(res.data.entries || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
    } catch (err) {
      setError("Failed to load entries.");
    } finally {
      setTableLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchDepartments(), fetchEntries(filters)]);
      setLastRefreshed(new Date());
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh: stats every 30s
  const startRefreshCycle = useCallback(() => {
    clearInterval(refreshTimerRef.current);
    clearInterval(countdownRef.current);

    setCountdown(REFRESH_INTERVAL / 1000);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return REFRESH_INTERVAL / 1000;
        return prev - 1;
      });
    }, 1000);

    refreshTimerRef.current = setInterval(async () => {
      await fetchStats();
      setLastRefreshed(new Date());
    }, REFRESH_INTERVAL);
  }, [fetchStats]);

  useEffect(() => {
    startRefreshCycle();
    return () => {
      clearInterval(refreshTimerRef.current);
      clearInterval(countdownRef.current);
    };
  }, [startRefreshCycle]);

  // Re-fetch entries when filters change
  useEffect(() => {
    fetchEntries(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleManualRefresh = async () => {
    await Promise.all([fetchStats(), fetchEntries(filters)]);
    setLastRefreshed(new Date());
    startRefreshCycle();
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value, page: 1 }));
  };

  const handleSort = (col) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: col,
      sortOrder: prev.sortBy === col && prev.sortOrder === "desc" ? "asc" : "desc",
      page: 1,
    }));
  };

  const handlePageChange = (newPage) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const clearFilters = () => {
    setFilters((prev) => ({
      ...prev,
      search: "",
      department: "",
      dateFrom: "",
      dateTo: "",
      status: "",
      page: 1,
    }));
  };

  const SortIcon = ({ col }) => {
    if (filters.sortBy !== col)
      return <span className="sort-icon sort-icon--neutral">⇅</span>;
    return (
      <span className="sort-icon sort-icon--active">
        {filters.sortOrder === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  const maxDeptCount =
    stats?.departmentBreakdown?.[0]?.count || 1;

  if (loading) {
    return (
      <div className="page-loading">
        <div className="page-loading__inner">
          <div className="logo-mark">PSG</div>
          <div className="spinner spinner--lg" />
          <p>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="page-error">
        <span className="page-error__icon">⚠️</span>
        <h2>Could not connect</h2>
        <p>{error}</p>
        <button className="btn btn--primary" onClick={handleManualRefresh}>
          Retry
        </button>
      </div>
    );
  }

  const hasActiveFilters =
    filters.search || filters.department || filters.dateFrom || filters.dateTo || filters.status;

  // ── Stat Card Click Handlers ──
  const getTodayDateString = () => {
    const d = new Date();
    // Offset by IST to get the local date string (since Date gives UTC day)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffset);
    return istDate.toISOString().split("T")[0];
  };

  const getMondayDateString = () => {
    const d = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffset);
    const day = istDate.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
    istDate.setUTCDate(istDate.getUTCDate() + diff);
    return istDate.toISOString().split("T")[0];
  };

  const handleStatClick = (type) => {
    const today = getTodayDateString();
    
    if (type === 'total') {
      clearFilters();
    } else if (type === 'today') {
      setFilters(prev => ({ ...prev, search: "", department: "", status: "", dateFrom: today, dateTo: today, page: 1 }));
    } else if (type === 'week') {
      const monday = getMondayDateString();
      setFilters(prev => ({ ...prev, search: "", department: "", status: "", dateFrom: monday, dateTo: today, page: 1 }));
    } else if (type === 'inside') {
      setFilters(prev => ({ ...prev, search: "", department: "", dateFrom: "", dateTo: "", status: "inside", page: 1 }));
    }
  };

  const isStatActive = (type) => {
    const today = getTodayDateString();
    const monday = getMondayDateString();
    
    if (type === 'total') return !hasActiveFilters;
    if (type === 'today') return filters.dateFrom === today && filters.dateTo === today && !filters.status;
    if (type === 'week') return filters.dateFrom === monday && filters.dateTo === today && !filters.status;
    if (type === 'inside') return filters.status === 'inside' && !filters.dateFrom && !filters.dateTo;
    return false;
  };

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <header className="header">
        <div className="header__brand">
          <img src="/psg-logo.png" alt="PSG Logo" className="header__logo-img" />
          <div>
            <h1 className="header__title">PSGCares</h1>
            <p className="header__subtitle">Staff Dashboard · Lab Entry Monitor</p>
          </div>
        </div>

        <div className="header__right">
          <div className="header__clock">
            <span className="header__time">
              {clock.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              })}
            </span>
            <span className="header__date">
              {clock.toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>

          <div className="header__refresh-info">
            {lastRefreshed && (
              <span className="header__last-refresh">
                Updated {lastRefreshed.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })}
              </span>
            )}
            <div className="refresh-countdown">
              <svg className="refresh-ring" viewBox="0 0 36 36">
                <circle
                  className="refresh-ring__track"
                  cx="18" cy="18" r="15"
                  fill="none" strokeWidth="3"
                />
                <circle
                  className="refresh-ring__progress"
                  cx="18" cy="18" r="15"
                  fill="none" strokeWidth="3"
                  strokeDasharray={`${(countdown / (REFRESH_INTERVAL / 1000)) * 94} 94`}
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
              </svg>
              <span className="refresh-countdown__label">{countdown}s</span>
            </div>
            <button
              className="btn btn--icon"
              onClick={handleManualRefresh}
              title="Refresh now"
              id="refresh-btn"
            >
              ↻
            </button>
          </div>
        </div>
      </header>

      {/* ── Stats Row ── */}
      <section className="stats-section">
        <StatCard
          icon={<IconPeople />}
          label="Total Records"
          value={stats?.totalEntries ?? "—"}
          color="purple"
          sublabel="All time"
          onClick={() => handleStatClick('total')}
          active={isStatActive('total')}
        />
        <StatCard
          icon={<IconCalendar />}
          label="Today's Entries"
          value={stats?.todayEntries ?? "—"}
          color="info"
          sublabel="Since midnight"
          onClick={() => handleStatClick('today')}
          active={isStatActive('today')}
        />
        <StatCard
          icon={<IconWeek />}
          label="This Week"
          value={stats?.weekEntries ?? "—"}
          color="warning"
          sublabel="Mon – today"
          onClick={() => handleStatClick('week')}
          active={isStatActive('week')}
        />
        <StatCard
          icon={<IconLab />}
          label="In Lab Now"
          value={stats?.currentlyInside ?? "—"}
          color="success"
          sublabel="Not yet checked out"
          onClick={() => handleStatClick('inside')}
          active={isStatActive('inside')}
        />
      </section>

      {/* ── Body: Chart + Table ── */}
      <div className="body-grid">
        {/* Department Breakdown */}
        <aside className="dept-panel panel">
          <div className="panel__header">
            <h2 className="panel__title">By Department</h2>
            <span className="panel__badge">{stats?.departmentBreakdown?.length ?? 0}</span>
          </div>
          <div className="dept-list">
            {stats?.departmentBreakdown?.length > 0 ? (
              stats.departmentBreakdown.map((d) => (
                <DeptBar
                  key={d._id}
                  name={d._id || "Unknown"}
                  count={d.count}
                  max={maxDeptCount}
                  active={filters.department === d._id}
                  onClick={() => handleFilterChange("department", filters.department === d._id ? "" : d._id)}
                />
              ))
            ) : (
              <EmptyState message="No department data yet." />
            )}
          </div>

          {/* Recent Entries panel */}
          <div className="recent-section">
            <div className="panel__header" style={{ marginTop: "24px" }}>
              <h2 className="panel__title">Recent Entries</h2>
              <span className="panel__badge">{stats?.recentEntries?.length ?? 0}</span>
            </div>
            <div className="recent-list">
              {stats?.recentEntries?.length > 0 ? (
                stats.recentEntries.map((e) => (
                  <div key={e._id} className="recent-item">
                    <div className="recent-item__avatar">
                      {e.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="recent-item__info">
                      <span className="recent-item__name">{e.name}</span>
                      <span className="recent-item__meta">{e.id} · {e.department}</span>
                      <span className="recent-entry__time">{formatProvidedTime(e.inTime).split(',')[1]}</span>
                    </div>
                    <StatusBadge inside={isInsideLab(e)} />
                  </div>
                ))
              ) : (
                <EmptyState message="No recent entries." />
              )}
            </div>
          </div>
        </aside>

        {/* Main entries table */}
        <main className="table-panel panel">
          <div className="panel__header">
            <div>
              <h2 className="panel__title">All Entries</h2>
              <span className="panel__meta">
                {total} record{total !== 1 ? "s" : ""} found
              </span>
            </div>
          </div>

          {/* Filters */}
          <div className="filters">
            <div className="filters__search-wrap">
              <span className="filters__search-icon">
                <IconSearch />
              </span>
              <input
                id="search-input"
                className="filters__search"
                type="text"
                placeholder="Search by name or roll number…"
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
              />
            </div>

            <select
              id="dept-filter"
              className="filters__select"
              value={filters.department}
              onChange={(e) => handleFilterChange("department", e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              id="status-filter"
              className="filters__select"
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
            >
              <option value="">All Status</option>
              <option value="inside">In Lab</option>
              <option value="left">Left</option>
            </select>

            <div className="filters__date-group">
              <input
                id="date-from"
                className="filters__date"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
                title="From date"
              />
              <span className="filters__date-sep">→</span>
              <input
                id="date-to"
                className="filters__date"
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                title="To date"
              />
            </div>

            {hasActiveFilters && (
              <button className="btn btn--ghost btn--sm" onClick={clearFilters} id="clear-filters">
                ✕ Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div className="table-wrap">
            {tableLoading ? (
              <Spinner />
            ) : entries.length === 0 ? (
              <EmptyState message="No entries match your filters." />
            ) : (
              <table className="entries-table">
                <thead>
                  <tr>
                    <th className="th th--sortable" onClick={() => handleSort("name")}>
                      Name <SortIcon col="name" />
                    </th>
                    <th className="th">Roll No.</th>
                    <th className="th th--sortable" onClick={() => handleSort("department")}>
                      Department <SortIcon col="department" />
                    </th>
                    <th className="th th--sortable" onClick={() => handleSort("inTime")}>
                      In-Time <SortIcon col="inTime" />
                    </th>
                    <th className="th">Out-Time</th>
                    <th className="th">Duration</th>
                    <th className="th">Status</th>
                    <th className="th">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const inside = isInsideLab(entry);
                    const expanded = expandedRow === entry._id;
                    return (
                      <React.Fragment key={entry._id}>
                        <tr
                          className={`tr ${inside ? "tr--inside" : ""} ${expanded ? "tr--expanded" : ""}`}
                        >
                          <td className="td td--name">
                            <div className="td-avatar">{entry.name?.[0]?.toUpperCase()}</div>
                            <span>{entry.name}</span>
                          </td>
                          <td className="td td--mono">{entry.id}</td>
                          <td className="td">
                            <span className="dept-chip">{entry.department}</span>
                          </td>
                          <td className="td td--time">{formatProvidedTime(entry.inTime)}</td>
                          <td className="td td--time">
                            {entry.outTime ? formatProvidedTime(entry.outTime) : <span className="text-muted">—</span>}
                          </td>
                          <td className="td td--duration">
                            {getDuration(entry.inTime, entry.outTime)}
                          </td>
                          <td className="td">
                            <StatusBadge inside={inside} />
                          </td>
                          <td className="td">
                            <button
                              className="btn btn--ghost btn--xs"
                              onClick={() => setExpandedRow(expanded ? null : entry._id)}
                              id={`expand-${entry._id}`}
                            >
                              {expanded ? "▲" : "▼"}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="tr-detail">
                            <td colSpan={8}>
                              <div className="detail-panel">
                                <div className="detail-field">
                                  <span className="detail-field__label">Purpose of Visit</span>
                                  <span className="detail-field__value">{entry.purpose || "—"}</span>
                                </div>
                                <div className="detail-field">
                                  <span className="detail-field__label">Entry Created</span>
                                  <span className="detail-field__value">{formatRealTime(entry.createdAt)}</span>
                                </div>
                                <div className="detail-field">
                                  <span className="detail-field__label">Record ID</span>
                                  <span className="detail-field__value detail-field__value--mono">{entry._id}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn--ghost btn--sm"
                disabled={filters.page <= 1}
                onClick={() => handlePageChange(filters.page - 1)}
                id="prev-page"
              >
                ← Prev
              </button>
              <div className="pagination__pages">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pg;
                  if (totalPages <= 7) {
                    pg = i + 1;
                  } else if (filters.page <= 4) {
                    pg = i + 1;
                    if (i === 6) pg = totalPages;
                  } else if (filters.page >= totalPages - 3) {
                    pg = totalPages - 6 + i;
                    if (i === 0) pg = 1;
                  } else {
                    pg = filters.page - 3 + i;
                    if (i === 0) pg = 1;
                    if (i === 6) pg = totalPages;
                  }
                  return (
                    <button
                      key={`pg-${pg}`}
                      className={`btn btn--page ${filters.page === pg ? "btn--page-active" : ""}`}
                      onClick={() => handlePageChange(pg)}
                      id={`page-${pg}`}
                    >
                      {pg}
                    </button>
                  );
                })}
              </div>
              <button
                className="btn btn--ghost btn--sm"
                disabled={filters.page >= totalPages}
                onClick={() => handlePageChange(filters.page + 1)}
                id="next-page"
              >
                Next →
              </button>
              <span className="pagination__info">
                Page {filters.page} of {totalPages} · {total} records
              </span>
            </div>
          )}
        </main>
      </div>

      {/* ── Footer ── */}
      <footer className="footer">
        <span>PSGCares · Staff Dashboard</span>
        <span>PSG College of Technology, Coimbatore</span>
        <span>Data refreshes every {REFRESH_INTERVAL / 1000}s</span>
      </footer>
    </div>
  );
};

export default Dashboard;
