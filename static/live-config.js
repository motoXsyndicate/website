/*
  MotoXsyndicate Live defaults.

  The published Google Sheet controls the live page and is checked every
  10 seconds. Column A contains field names and column B contains values.
  Division, Format, and Server are supported with the labels:
    Division
    Format
    Server

  See MXS-LIVE-SETUP.txt and MXS-LIVE-SHEET-TEMPLATE.csv for the complete
  list of spreadsheet-controlled fields.
*/
window.MXS_LIVE_CONFIG = {
  sheetRefreshSeconds: 10,
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSDh_2uayWivXOYfVNi82Hkygo690LBNWiI5yiKrWZ7d_Nrc3nV_GygbuOWV-iuyPm8QDOMP_1FUQyr/pub?gid=0&single=true&output=csv",

  status: "offline",
  youtubeVideoId: "",
  youtubeUrl: "",

  eventTitle: "MotoXsyndicate Live",
  subtitle: "Live competition, event information, and results—all in one place.",
  round: "Next Broadcast",
  track: "Map To Be Announced",
  session: "Live Coverage",
  raceClass: "Open Division",
  raceFormat: "Competition",
  server: "MXS Live",
  host: "MotoXsyndicate",
  eventDate: "To Be Announced",
  eventTime: "To Be Announced",
  startTime: "",

  announcement: "The next MXS broadcast will appear here.",
  countdownLabel: "Event starts in",
  ticker: "",
  scheduleNote: "Times shown in Central Time.",

  registrationUrl: "",
  resultsUrl: "/results/",
  discordUrl: "https://discord.gg/2XXBNqXJwD",

  schedule: [
    { time: "TBA", title: "Event schedule coming soon", detail: "Check back before the broadcast" }
  ],

  nextEvent: {
    title: "More MXS competition coming soon",
    description: "The next event will be announced through Discord and MotoXsyndicate.com.",
    date: "Date TBA",
    track: "Map TBA"
  },

  sponsors: [
    { name: "MOTOXSYNDICATE", label: "Official Series Organizer", url: "https://www.motoxsyndicate.com" },
    { name: "PARTNER SPACE", label: "Broadcast sponsorship available", url: "" },
    { name: "PARTNER SPACE", label: "Support MXS live coverage", url: "" }
  ]
};
