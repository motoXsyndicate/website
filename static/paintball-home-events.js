(function () {
  "use strict";
  const container=document.getElementById("paintball-home-events");
  if (!container) return;
  const escapeHtml=(value)=>String(value??"").replace(/[&<>'"]/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const formatDate=(value)=>new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(value));
  const statusLabel=(status)=>({check_in_open:"Registration open",check_in_closed:"Confirmation closed",teams_generated:"Teams being prepared",teams_published:"Teams published"}[status]||"Event posted");
  fetch("/api/paintball/public/events",{headers:{Accept:"application/json"}}).then(async(response)=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||"Upcoming events could not be loaded.");
    if(!data.events?.length){container.innerHTML='<article class="home-event-card home-event-empty"><h3>No upcoming events posted yet</h3><p>Watch Discord for the next pickup-night announcement.</p></article>';return;}
    container.innerHTML=data.events.map((event)=>`<article class="home-event-card"><div><span>${escapeHtml(statusLabel(event.status))} · ${event.team_size}v${event.team_size}</span><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(formatDate(event.starts_at))}</p><small>${event.registration_count} registered · ${event.confirmation_count} confirmed</small></div><a class="btn primary" href="/paintball/register/?eventId=${encodeURIComponent(event.id)}">View &amp; Register</a></article>`).join("");
  }).catch((error)=>{container.innerHTML=`<article class="home-event-card home-event-empty"><h3>Events temporarily unavailable</h3><p>${escapeHtml(error.message)}</p></article>`;});
})();
