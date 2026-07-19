/*
  MotoXsyndicate Live defaults.

  The published Google Sheet controls the live page and is checked every
  10 seconds. Column A contains field names and column B contains values.
  Class, Format, and Server are supported with the labels:
    Class
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

  eventTitle: "MotoXsyndicate Outdoor Championship",
  subtitle: "Race coverage, event information, and results—all in one place.",
  round: "Next Broadcast",
  track: "Track To Be Announced",
  session: "Race Coverage",
  raceClass: "Open Class",
  raceFormat: "Two Motos",
  server: "MXS Racing",
  host: "MotoXsyndicate",
  eventDate: "To Be Announced",
  eventTime: "To Be Announced",
  startTime: "",

  announcement: "The next MXS broadcast will appear here.",
  countdownLabel: "Gate drops in",
  ticker: "",
  scheduleNote: "Times shown in Central Time.",

  registrationUrl: "",
  resultsUrl: "",
  discordUrl: "https://discord.gg/2XXBNqXJwD",

  schedule: [
    { time: "6:00 PM", title: "Open Practice", detail: "Server opens for riders" },
    { time: "6:20 PM", title: "Qualifying", detail: "Timed qualifying session" },
    { time: "7:00 PM", title: "Moto 1", detail: "Championship points begin" },
    { time: "After Moto 1", title: "Moto 2", detail: "Final moto and overall results" }
  ],

  nextEvent: {
    title: "More MXS racing coming soon",
    description: "The next event will be announced through Discord and MotoXsyndicate.com.",
    date: "Date TBA",
    track: "Track TBA"
  },

  sponsors: [
    { name: "MOTOXSYNDICATE", label: "Official Series Organizer", url: "https://www.motoxsyndicate.com" },
    { name: "PARTNER SPACE", label: "Broadcast sponsorship available", url: "" },
    { name: "PARTNER SPACE", label: "Support MXS race coverage", url: "" }
  ]
};
