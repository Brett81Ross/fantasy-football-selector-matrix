'use strict';

function parseCsvLine(line){
  const out=[];let field='',quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(quoted&&line[i+1]==='"'){field+='"';i++;}
      else quoted=!quoted;
    }else if(ch===','&&!quoted){out.push(field);field='';}
    else field+=ch;
  }
  out.push(field);
  return out;
}

function csvRows(text){
  const lines=String(text||'').split(/\r?\n/).filter(Boolean);
  if(!lines.length)return[];
  const header=parseCsvLine(lines[0]).map(x=>x.replace(/^\uFEFF/,''));
  return lines.slice(1).map(line=>{
    const cols=parseCsvLine(line),row={};
    header.forEach((key,index)=>{row[key]=cols[index]??'';});
    return row;
  });
}

function nthSunday(year,monthIndex,n){
  const first=new Date(Date.UTC(year,monthIndex,1));
  const firstSunday=1+((7-first.getUTCDay())%7);
  return firstSunday+(n-1)*7;
}

function easternUtcOffsetHours(year,month,day){
  const dstStart=nthSunday(year,2,2);
  const dstEnd=nthSunday(year,10,1);
  if(month>3&&month<11)return 4;
  if(month<3||month>11)return 5;
  if(month===3)return day>=dstStart?4:5;
  return day<dstEnd?4:5;
}

function easternKickoffToIso(gameday,gametime){
  const dateMatch=String(gameday||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch=String(gametime||'').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(!dateMatch||!timeMatch)return null;
  const year=Number(dateMatch[1]),month=Number(dateMatch[2]),day=Number(dateMatch[3]);
  const hour=Number(timeMatch[1]),minute=Number(timeMatch[2]),second=Number(timeMatch[3]||0);
  if(month<1||month>12||day<1||day>31||hour<0||hour>23||minute<0||minute>59||second<0||second>59)return null;
  const offset=easternUtcOffsetHours(year,month,day);
  const stamp=Date.UTC(year,month-1,day,hour+offset,minute,second);
  if(!Number.isFinite(stamp))return null;
  const check=new Date(Date.UTC(year,month-1,day));
  if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return null;
  return new Date(stamp).toISOString();
}

function normalizeTeam(team){
  const value=String(team||'').trim().toUpperCase();
  return value==='WAS'?'WSH':value;
}

function completed(row){
  if(String(row.result||'').trim())return true;
  const away=String(row.away_score??'').trim(),home=String(row.home_score??'').trim();
  return away!==''&&home!==''&&Number.isFinite(Number(away))&&Number.isFinite(Number(home));
}

function parseNflverseSchedule(text,{season=null,week=null}={}){
  const targetSeason=season==null?null:Number(season);
  const targetWeek=week==null?null:Number(week);
  const games=[];
  for(const row of csvRows(text)){
    const rowSeason=Number(row.season),rowWeek=Number(row.week);
    if(targetSeason!=null&&rowSeason!==targetSeason)continue;
    if(targetWeek!=null&&rowWeek!==targetWeek)continue;
    if(String(row.game_type||'REG').toUpperCase()!=='REG')continue;
    const kickoffAt=easternKickoffToIso(row.gameday,row.gametime);
    const away=normalizeTeam(row.away_team),home=normalizeTeam(row.home_team);
    if(!row.game_id||!kickoffAt||!away||!home)continue;
    games.push({
      id:String(row.game_id),
      name:`${away} at ${home}`,
      kickoffAt,
      state:completed(row)?'post':'pre',
      teams:[away,home],
      season:rowSeason,
      week:rowWeek
    });
  }
  return games.sort((a,b)=>a.kickoffAt.localeCompare(b.kickoffAt)||a.id.localeCompare(b.id));
}

module.exports={easternKickoffToIso,parseNflverseSchedule};
