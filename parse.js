
'use strict';

const escapeTable=[];
escapeTable[38]='&amp;';escapeTable[60]='&lt;';escapeTable[62]='&gt;';escapeTable[34]='&quot;';escapeTable[39]='&#39;';
const entityPattern=/&(?:#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);/y;
const escapeTest=/[&<>"']/;
const inlineCodePattern=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
const inlineHtmlPattern=/^<(?! )[^<>]*?>/;
const unicodePunctuationPattern=/[\p{P}\p{S}]/u;
const unicodeWhitespacePattern=/\s/u;
const textBoundary = /[\\<!\[`*_~]|https?:\/\/|ftp:\/\/|www\.|(?:mailto:|xmpp:)?[A-Za-z0-9._+-]+@| {2,}\n/gi;
const textBoundaryNoEmail = /[\\<!\[`*_~]|https?:\/\/|ftp:\/\/|www\.| {2,}\n/gi;
const listItemPatterns=Object.create(null);
for(const bull of ['\\*','\\+','\\-','\\d{1,9}\\.','\\d{1,9}\\)'])listItemPatterns[bull]=new RegExp(`^( {0,3}${bull})((?:[\\t ][^\\n]*)?(?:\\n|$))`);
const emphasisBoundary=/[\\<\[!_`*]/g;
function punctuation(c){
  if(!c)return false;
  const n=c.charCodeAt(0);
  if(n<128)return n>=33&&n<=47||n>=58&&n<=64||n>=91&&n<=96||n>=123&&n<=126;
  return unicodePunctuationPattern.test(c);
}
function whitespace(c){
  if(!c)return true;
  const n=c.charCodeAt(0);return n<128?n===32||n>=9&&n<=13:unicodeWhitespacePattern.test(c);
}
function emphasisFlags(ch,before,after){
  const beforeSpace=whitespace(before),afterSpace=whitespace(after);
  const beforePunct=punctuation(before),afterPunct=punctuation(after);
  const left=!afterSpace&&(!afterPunct||beforeSpace||beforePunct);
  const right=!beforeSpace&&(!beforePunct||afterSpace||afterPunct);
  const open=ch==='_'?left&&(!right||beforePunct):left;
  const close=ch==='_'?right&&(!left||afterPunct):right;
  return (open?1:0)|(close?2:0);
}
const listBoundaries=Array.from({length:4},(_,i)=>new RegExp('^ {0,'+i+'}(?:[*+-]|\\d{1,9}[.)])(?=[ \\t]|$)'));
export function escape(html, encode) {
  if(!escapeTest.test(html))return html;
  let out='',start=0;
  for(let i=0;i<html.length;i++){
    const ch=html.charCodeAt(i);
    if(ch>62)continue;
    const replacement=escapeTable[ch];if(replacement===undefined)continue;
    if(ch===38&&!encode){entityPattern.lastIndex=i;if(entityPattern.test(html)){i=entityPattern.lastIndex-1;continue;}}
    out+=html.slice(start,i)+replacement;start=i+1;
  }
  return start?out+html.slice(start):html;
}
function cleanUrl(href) { try { return encodeURI(href).replace(/%25/g, '%'); } catch { return null; } }
function trimEndChar(s, ch) { let i = s.length; while (i > 0 && s[i-1] === ch) i--; return s.slice(0,i); }
function ge(s) {
  const e = s.split('\n'); let t = e.length - 1;
  while (t >= 0 && /^[ \t]*$/.test(e[t])) t--;
  if (e.length - t <= 2) return s;
  return e.slice(0, t + 1).join('\n');
}
function indentCodeCompensation(raw, text) {
  const m = /^(\s+)(?:```)/.exec(raw); if (!m) return text;
  const p = m[1]; return text.split('\n').map(l => { const lm=/^(\s*)/.exec(l); if(!lm) return l; const c=Math.min(lm[1].length,p.length); return c?l.slice(c):l; }).join('\n');
}
function splitCells(row, count) {
  const cells=[];let start=0;
  for(let offset=row.indexOf('|');offset!==-1;offset=row.indexOf('|',offset+1)){
    let escaped=false,p=offset-1;while(p>=0&&row[p]==='\\'){escaped=!escaped;p--;}
    if(!escaped){cells.push(row.slice(start,offset));start=offset+1;}
  }
  cells.push(row.slice(start));
  if (cells.length && !cells[0].trim()) cells.shift();
  if (cells.length && !cells[cells.length - 1].trim()) cells.pop();
  if (count != null) { if (cells.length > count) cells.splice(count); else while (cells.length < count) cells.push(''); }
  for (let i=0;i<cells.length;i++) cells[i] = cells[i].trim().replace(/\\\|/g,'|');
  return cells;
}
function outputLink(cap, link, raw, lexer) {
  const href = link.href, title = link.title || null;
  const text = cap[1].includes('\\') ? cap[1].replace(/\\([\[\]])/g, '$1') : cap[1];
  const isImage = cap[0].charAt(0) === '!';
  const inLink = lexer.state.inLink, emitted0 = lexer.state.linkEmitted, inRaw = lexer.state.inRawBlock;
  lexer.state.inLink = true; lexer.state.linkEmitted = false;
  const tokens = lexer.inlineTokens(text, []);
  const emitted = lexer.state.linkEmitted;
  lexer.state.linkEmitted = emitted0; lexer.state.inLink = inLink;
  if (!isImage) { if (emitted) { lexer.state.inRawBlock = inRaw; return null; } lexer.state.linkEmitted = true; }
  return { type: isImage ? 'image' : 'link', raw, href, title, text, tokens };
}
function tabWidthPrefix(line, cols) {
  let w=0,i=0; while(i<line.length && w<cols){ if(line[i]==='\t'){const add=4-(w%4); if(w+add>cols) break; w+=add; i++;} else if(line[i]===' '){w++; i++;} else break; } return i;
}
function stripIndent4(line) {
  let w=0,i=0; while(i<line.length && w<4){ if(line[i]==='\t'){w=4;i++;} else if(line[i]===' '){w++;i++;} else break; } return line.slice(i);
}
function expandTabs(s, column=0) {
  let tab=s.indexOf('\t'); if(tab===-1) return s;
  let out='',start=0;
  do { column+=tab-start; const n=4-column%4; out+=s.slice(start,tab)+' '.repeat(n); column+=n; start=tab+1; tab=s.indexOf('\t',start); } while(tab!==-1);
  return out+s.slice(start);
}
function decodeEntities(s) {
  if(!s.includes('&#'))return s;
  return s.replace(/&#(?:x[\da-f]{1,6}|\d{1,7});/gi, m => {
    const hex = /^&#x/i.test(m);
    let cp = parseInt(m.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    if (!cp || cp > 0x10ffff || cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
    return String.fromCodePoint(cp);
  });
}
function labelCrossesHtml(src,label,start){
  if(!label.includes('<'))return false;
  for(let i=0;i<label.length;i++){
    if(label[i]==='\\'){i++;continue;}
    if(label[i]==='`'){const m=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/.exec(label.slice(i));if(m){i+=m[0].length-1;continue;}}
    if(label[i]==='<'){const m=/^<(?! )[^<>]*?>/.exec(src.slice(start+i));if(m){if(m[0].length>label.length-i)return true;i+=m[0].length-1;}}
  }
  return false;
}
function labelEnd(src,start){
  let depth=1;
  for(let i=start;i<src.length;i++){
    if(src[i]==='\\'){i++;continue;}
    if(src[i]==='`'){const m=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/.exec(src.slice(i));if(m){i+=m[0].length-1;continue;}}
    if(src[i]==='<'){const m=/^<(?! )[^<>]*?>/.exec(src.slice(i));if(m){i+=m[0].length-1;continue;}}
    if(src[i]==='[')depth++;
    if(src[i]===']'&&!--depth)return i;
  }
  return -1;
}
function precedingChar(src, end) {
  if (!end) return '';
  const c = src.charCodeAt(end - 1);
  return src.slice(c >= 0xdc00 && c <= 0xdfff && end > 1 && src.charCodeAt(end - 2) >= 0xd800 && src.charCodeAt(end - 2) <= 0xdbff ? end - 2 : end - 1, end);
}

const block = {
  newline: /^(?:[ \t]*(?:\n|$))+/,
  code: /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,
  fences: /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}(?:(?=`)\1`*|(?=~)\1~*)[ \t]*(?=\n|$)|$)/,
  hr: /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,
  heading: /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,
  lheading: /^(?! {0,3}(?:[*+-]|\d{1,9}[.)]) |(?: {4}| {0,3}\t)| {0,3}(?:`{3,}|~{3,})| {0,3}>| {0,3}#{1,6}(?:\s|$)| {0,3}<[^\n>]+>\n| {0,3}\|?(?:[:\- ]*\|)+[:\- ]*\n)((?:.|\n(?!\s*?\n| {0,3}(?:[*+-]|\d{1,9}[.)]) | {0,3}(?:`{3,}|~{3,})| {0,3}>| {0,3}#{1,6}(?:\s|$)| {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)| {0,3}<[^\n>]+>\n| {0,3}\|?(?:[:\- ]*\|)+[:\- ]*\n))+?)\n {0,3}(=+|-+)[ \t]*(?:\n+|$)/,
  blockquoteStart: /^ {0,3}>/,
  def: /^ {0,3}\[((?!\s*\])(?:\\[\s\S]|[^\[\]\\]|\n(?![ \t]*\n))+)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\\n]|\n(?!\n))*'|\((?:\\[\s\S]|[^()\\])*\)))? *(?:\n+|$)/,
  text: /^[^\n]+/,
};
const htmlBlock = /^ {0,3}(?:<(script|pre|style|textarea)[\s>][\s\S]*?(?:<\/\1>[^\n]*\n*|$)|<!--(?!-?>)[\s\S]*?(?:-->|$)|<\?[\s\S]*?(?:\?>[^\n]*\n*|$)|<![A-Z][\s\S]*?(?:>[^\n]*\n*|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>[^\n]*\n*|$)|<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ \t]+|[\n\/>]|$)[\s\S]*?(?:(?:\n[ \t]*)+\n|$)|<(?!script|pre|style|textarea)([a-z][a-z0-9-]*)(?:[ \t]+[a-zA-Z:_][\w.:-]*(?:[ \t]*=[ \t]*"[^"\n]*"|[ \t]*=[ \t]*'[^'\n]*'|[ \t]*=[ \t]*[^\s"'=<>`]+)?)*?[ \t]*\/?>(?=[ \t]*(?:\n|$))[\s\S]*?(?:(?:\n[ \t]*)+\n|$)|<\/(?!script|pre|style|textarea)[a-z][a-z0-9-]*[ \t]*>(?=[ \t]*(?:\n|$))[\s\S]*?(?:(?:\n[ \t]*)+\n|$))/i;

export function parse(src) {
  if (src == null) return '';
  src = String(src).replace(/\r\n?/g, '\n');
  const lexer = new Lexer();
  return new Parser(lexer).parse(lexer.lex(src));
}

class Lexer {
  constructor() {
    this.tokens = []; this.tokens.links = Object.create(null);
    this.inlineQueue = []; this.state = { inLink:false,inRawBlock:false,top:true,linkEmitted:false };
  }
  lex(src) {
    this.tokens = []; this.tokens.links = Object.create(null); this.inlineQueue = [];
    this.state.top = true; this.blockTokens(src, this.tokens, true);
    // References are complete now. Reuse inline fragments only within this document,
    // including all state that can affect inline tokenization in the cache key.
    const inlineCache=new Array(4);
    for (let i=0;i<this.inlineQueue.length;i++){
      const q=this.inlineQueue[i];this.state.inRawBlock=false;
      if(q.tokens.length||q.src.length<16){this.inlineTokens(q.src,q.tokens);continue;}
      const key=(this.state.inLink?1:0)|(this.state.linkEmitted?2:0);
      const cache=inlineCache[key]||(inlineCache[key]=new Map());
      const hit=cache.get(q.src);
      if(hit){
        for(let j=0;j<hit.tokens.length;j++)q.tokens.push(hit.tokens[j]);
        this.state.inLink=hit.inLink;this.state.inRawBlock=hit.inRawBlock;this.state.linkEmitted=hit.linkEmitted;
      }else{
        this.inlineTokens(q.src,q.tokens);
        cache.set(q.src,{tokens:q.tokens,inLink:this.state.inLink,inRawBlock:this.state.inRawBlock,linkEmitted:this.state.linkEmitted});
      }
    }
    this.inlineQueue=[]; return this.tokens;
  }
  blockTokens(src,tokens,top=true){
    const prevTop=this.state.top; this.state.top=top;
    let lastLen=Infinity;
    while(src){
      if(src.length<lastLen) lastLen=src.length; else throw new Error('Infinite loop: '+src.charCodeAt(0));
      let token;
      let lead=0;while(lead<3&&src.charCodeAt(lead)===32)lead++;
      const ch=src.charCodeAt(lead);
      if((lead>0||ch===9||ch===10)&&(token=this.tokenSpace(src))){ src=src.slice(token.raw.length); const last=tokens[tokens.length-1]; if(token.raw.length===1 && last!==undefined && !last.raw.endsWith('\n')) last.raw+='\n'; else tokens.push(token); continue; }
      if((lead>0||ch===9)&&(token=this.tokenCode(src))){ src=src.slice(token.raw.length); const last=tokens[tokens.length-1]; if(last&&(last.type==='paragraph'||last.type==='text')){ last.raw+=(last.raw.endsWith('\n')?'':'\n')+token.raw; last.text+='\n'+token.text; this.inlineQueue[this.inlineQueue.length-1].src=last.text; } else tokens.push(token); continue; }
      if((ch===96||ch===126)&&(token=this.tokenFences(src))){ src=src.slice(token.raw.length); tokens.push(token); continue; }
      if(ch===35&&(token=this.tokenHeading(src))){ src=src.slice(token.raw.length); tokens.push(token); continue; }
      if((ch===45||ch===95||ch===42)&&(token=this.tokenHr(src))){ src=src.slice(token.raw.length); tokens.push(token); continue; }
      if(ch===62&&(token=this.tokenBlockquote(src))){ src=src.slice(token.raw.length); tokens.push(token); continue; }
      if((ch===42||ch===43||ch===45||ch>=48&&ch<=57)&&(token=this.tokenList(src))){ src=src.slice(token.raw.length); tokens.push(token); continue; }
      if(ch===60&&(token=this.tokenHtml(src))){ src=src.slice(token.raw.length); tokens.push(token); continue; }
      if(ch===91&&(token=this.tokenDef(src))){ src=src.slice(token.raw.length); const last=tokens.at(-1);if(last&&(last.type==='paragraph'||last.type==='text')){last.raw+='\n'+token.raw;last.text+='\n'+token.raw;this.inlineQueue.at(-1).src=last.text;}else{if(!this.tokens.links[token.tag]) this.tokens.links[token.tag]={href:token.href,title:token.title}; tokens.push(token);} continue; }
      if((token=this.tokenTable(src))){ src=src.slice(token.raw.length); tokens.push(token); continue; }
      if((token=this.tokenLHeading(src))){ src=src.slice(token.raw.length); tokens.push(token); continue; }
      if(this.state.top && (token=this.tokenParagraph(src))){ const last=tokens[tokens.length-1]; if(!top && last && last.type==='paragraph'){ last.raw+=(last.raw.endsWith('\n')?'':'\n')+token.raw; last.text+='\n'+token.text; this.inlineQueue[this.inlineQueue.length-1].src=last.text; } else tokens.push(token); src=src.slice(token.raw.length); continue; }
      if((token=this.tokenText(src))){ src=src.slice(token.raw.length); const last=tokens[tokens.length-1]; if(last&&last.type==='text'){ this.inlineQueue.pop(); last.raw+=(last.raw.endsWith('\n')?'':'\n')+token.raw; last.text+='\n'+token.text; this.inlineQueue[this.inlineQueue.length-1].src=last.text; } else tokens.push(token); continue; }
      if(src) throw new Error('Infinite loop end: '+src.charCodeAt(0));
    }
    this.state.top=prevTop; return tokens;
  }
  tokenSpace(src){ const m=block.newline.exec(src); if(m&&m[0].length>0) return {type:'space',raw:m[0]}; }
  tokenCode(src){ const m=block.code.exec(src); if(m){ const raw=ge(m[0]); const text=raw.replace(/^(?: {0,3}\t| {1,4})/gm,''); return {type:'code',raw,codeBlockStyle:'indented',text}; } }
  tokenFences(src){ const m=block.fences.exec(src); if(m){ const raw=m[0]; let text=indentCodeCompensation(raw,m[3]||''); let lang=m[2]; if(lang) lang=lang.trim().replace(/\\([\p{P}\p{S}])/gu,'$1'); else lang=undefined; return {type:'code',raw,lang,text}; } }
  tokenHeading(src){ const m=block.heading.exec(src); if(m){ let text=m[2].trim(); if(/#$/.test(text)){ const t=trimEndChar(text,'#'); if(!t || /[ \t]$/.test(t)) text=t.trim(); } const raw=trimEndChar(m[0],'\n'); const depth=m[1].length; const tok={type:'heading',raw,depth,text,tokens:[]}; this.inlineQueue.push({src:text,tokens:tok.tokens}); return tok; } }
  tokenHr(src){ const m=block.hr.exec(src); if(m) return {type:'hr',raw:trimEndChar(m[0],'\n')}; }
  tokenBlockquote(src){
    if(!block.blockquoteStart.test(src)) return;
    let pos=0; const rlines=[];
    const innerLines=[], lazyIndented=[];
    while(pos<=src.length){
      const nl=src.indexOf('\n',pos), line=src.slice(pos,nl===-1?src.length:nl);
      if(/^ {0,3}>/.test(line)){rlines.push(line);innerLines.push(line.replace(/^( {0,3}>)([ \t]+)/,(m,p,s)=>p+expandTabs(s,p.length)).replace(/^ {0,3}> ?/,''));pos=nl===-1?src.length+1:nl+1;continue;}
      if(!line.trim()||!innerLines.at(-1)?.trim())break;
      const probe=new Lexer();probe.blockTokens(innerLines.join('\n'),probe.tokens,true);
      let last=probe.tokens.at(-1);while(last?.type==='blockquote'||last?.type==='list'){last=last.type==='blockquote'?last.tokens.at(-1):last.items.at(-1)?.tokens.at(-1);}
      if(!last||!['text','paragraph'].includes(last.type))break;
      if(/^ {0,3}(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,}|(?:[*+-]|1[.)])[ \t]+\S|<)/.test(line)||block.hr.test(line+'\n'))break;
      if(/^(?: {4}| {0,3}\t)/.test(line))lazyIndented.push(line);
      rlines.push(line);innerLines.push(/^ {0,3}(?:=+|-+)[ \t]*$/.test(line)?'    '+line.trimStart():line);pos=nl===-1?src.length+1:nl+1;
    }
    if(!rlines.length) return;
    let raw = rlines.join('\n'); const cl = raw.length; if(src.length>cl && src[cl]==='\n') raw+='\n'; raw=trimEndChar(raw,'\n');
    const inner = innerLines.join('\n');
    const tokens=[]; this.blockTokens(inner,tokens,true);
    for(const t of tokens)if(lazyIndented.length&&t.type==='paragraph'){
      for(const line of lazyIndented)t.text=t.text.replace('\n'+line,'\n'+line.replace(/^(?: {4}| {0,3}\t)/,''));
      const q=this.inlineQueue.find(q=>q.tokens===t.tokens);if(q)q.src=t.text;
    }
    return {type:'blockquote',raw,tokens,text: inner.replace(/\n$/,'')};
  }
  tokenList(src){
    const start = /^( {0,3}(?:[*+-]|\d{1,9}[.)]))([ \t][^\n]*|[ \t]*)(?:\n|$)/.exec(src);
    if(!start) return; if(block.hr.test(src)) return;
    const bull = start[1].trim(); const isOrdered = bull.length>1; const bullStr = isOrdered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
    const itemRe = listItemPatterns[bullStr];
    let rest=src; const items=[];
    while(rest){
      const m=itemRe.exec(rest); if(!m) break; if(block.hr.test(rest)) break;
      let itemRaw = m[0]; rest = rest.slice(itemRaw.length);
      let content = m[2].replace(/\n$/, '').replace(/^[ \t]+/, s=>expandTabs(s,m[1].length));
      // compute indent
      let indent = m[1].length; let space = 0; let textContent='';
      if(/^[ \t]*$/.test(content)){ indent = m[1].length + 1; textContent=''; }
      else { let w=content.search(/[^ ]/); if(w>4) w=1; indent=m[1].length+w; textContent=content.slice(w); }
      // continuation
      let itemText = textContent;
      let done=false;
      const boundary=listBoundaries[Math.min(3,indent-1)];
      let previous=textContent;
      while(rest && !done){
        const nl = rest.indexOf('\n'); const line = nl===-1?rest:rest.slice(0,nl); const seg = nl===-1?rest:rest.slice(0,nl+1);
        let lead=0;while(line.charCodeAt(lead)===32)lead++;
        const expanded=line.charCodeAt(lead)===9?line.replace(/^[ \t]+/,s=>expandTabs(s)):line;
        // blank line
        if(/^[ \t]*$/.test(line)){
          if(!itemText.trim()){itemRaw+=seg;rest=rest.slice(seg.length);break;}
          itemText += '\n';
          previous='';
          itemRaw += seg; rest = nl===-1?'':rest.slice(nl+1);
          continue;
        }
        // end conditions
        if(boundary.test(line)) break;
        if(expanded!==line){lead=0;while(expanded.charCodeAt(lead)===32)lead++;}
        if(lead>=indent){previous=expanded.slice(indent);itemText+='\n'+previous;itemRaw+=seg;rest=rest.slice(seg.length);continue;}
        const initial=line.charCodeAt(lead);
        if((initial===45||initial===95||initial===42)&&block.hr.test(rest)) break;
        if(initial===35&&/^ {0,3}#{1,6}(?:\s|$)/.test(line)) break;
        if(initial===62&&/^ {0,3}>/.test(line)) break;
        if((initial===96||initial===126)&&/^ {0,3}(?:`{3,}|~{3,})/.test(line)) break;
        if(initial===60&&/^ {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ \t]+|$|\/?>)/i.test(line)) break;
        // indented continuation
        let w=0, j=0; while(j<line.length){ if(line[j]==='\t'){w += 4-(w%4); j++;} else if(line[j]===' '){w++; j++;} else break; if(w>=indent) break; }
        if(w>=indent){ itemText += '\n' + expanded.slice(indent); itemRaw += seg; rest = nl===-1?'':rest.slice(nl+1); continue; }
        // lazy
        if(!previous.trim() || /^ {4}|^ {0,3}(?:`{3,}(?=[^`\n]*(?:\n|$))|~{3,}|#{1,6}(?:\s|$)|<(?:script|pre|style|textarea|!--|\?|![A-Z]|!\[CDATA\[|\/?(?:div|p|table|ul|ol|li|blockquote)(?:[\s/>]|$)))/i.test(previous)) break;
        itemText += '\n' + line; previous=expanded.slice(indent); itemRaw += seg; rest = nl===-1?'':rest.slice(nl+1);
      }
      // task
      let task=false, checked=false, ttext=itemText;
      const tm=/^\[([ xX])\][ \t]/.exec(ttext);
      if(tm){ task=true; checked = tm[1].toLowerCase()==='x'; ttext = ttext.replace(/^\[([ xX])\][ \t]+/, ''); }
      items.push({type:'list_item',raw:itemRaw,task,checked,loose:false,text:ttext,tokens:[]});
    }
    if(!items.length) return;
    items[items.length-1].text=items[items.length-1].text.trimEnd();
    items[items.length-1].raw=items[items.length-1].raw.trimEnd();
    // loose detection
    let loose=false;
    for(let k=0;k<items.length-1;k++){
      const raw=items[k].raw;let end=raw.length-1;
      while(raw.charCodeAt(end)===32||raw.charCodeAt(end)===9)end--;
      if(raw.charCodeAt(end--)!==10)continue;
      while(raw.charCodeAt(end)===32||raw.charCodeAt(end)===9)end--;
      if(raw.charCodeAt(end)===10){loose=true;break;}
    }
    const listTok={type:'list',raw:trimEndChar(src.slice(0,src.length-rest.length),'\n'),ordered:isOrdered,start:isOrdered?+bull.slice(0,-1):'',loose,items};
    // tokenize
    const prevTop=this.state.top;
    for(const it of items){
      this.state.top=false;
       it.tokens = this.blockTokens(it.text, [], false);
      // strip trailing space token effects? marked keeps structure
      if(it.task){
        const cb={type:'checkbox',raw:(it.checked?'[x] ':'[ ] '),checked:it.checked};
        if(listTok.loose){
          const first=it.tokens[0];
          if(first && (first.type==='paragraph'||first.type==='text') && first.tokens){ first.raw=cb.raw+first.raw; first.text=cb.raw+first.text; first.tokens.unshift(cb); }
          else it.tokens.unshift({type:'paragraph',raw:cb.raw,text:cb.raw,tokens:[cb]});
        } else {
          it.tokens.unshift(cb);
        }
      }
    }
    // refine loose
    if(!listTok.loose){
      for(const it of items){ for(const t of it.tokens){ if(t.type==='space' && /\n.*\n/.test(t.raw)){ listTok.loose=true; break; } } if(listTok.loose) break; }
    }
    if(listTok.loose){ for(const it of items){ it.loose=true; for(const t of it.tokens) if(t.type==='text') t.type='paragraph'; if(it.tokens[0]?.type==='checkbox'&&it.tokens[1]?.type==='paragraph'){const cb=it.tokens.shift();it.tokens[0].tokens.unshift(cb);} } }
    this.state.top=prevTop;
    return listTok;
  }
  tokenHtml(src){ const m=htmlBlock.exec(src); if(m){ let raw=ge(m[0]);if(/^ {0,3}<!--/.test(raw)&&raw.includes('-->')){const end=src.indexOf('\n',raw.indexOf('-->')+3);raw=ge(src.slice(0,end<0?src.length:end+1)+(src[end+1]==='\n'?'\n':''));} return {type:'html',block:true,raw,pre:m[1]==='pre'||m[1]==='script'||m[1]==='style',text:raw}; } }
  tokenDef(src){ const m=block.def.exec(src); if(m){ let href=m[2]||''; // basic paren check
      if(!/^<.*>$/.test(href)){ let d=0; for(let i=0;i<href.length;i++){ if(href[i]==='\\'){i++;continue;} if(href[i]==='(') d++; else if(href[i]===')'){d--; if(d<0) return;} } if(d>0) return; }
      const tag=m[1].toLowerCase().replace(/\s+/g,' '); href=href.replace(/^<(.*)>$/,'$1').replace(/\\([\p{P}\p{S}])/gu,'$1');
      let title=m[3]; if(title) title=title.substring(1,title.length-1).replace(/\\([\p{P}\p{S}])/gu,'$1'); else title=undefined;
      return {type:'def',tag,raw:trimEndChar(m[0],'\n'),href,title}; } }
  tokenTable(src){
    const nl=src.indexOf('\n');if(nl<0)return;
    let start=nl+1;while(src.charCodeAt(start)===32&&start<nl+4)start++;
    const ch=src.charCodeAt(start);if(ch!==124&&ch!==58&&ch!==45)return;
    const m = /^([^\n]+)\n {0,3}((?:\| *)?:?-+:? *(?:\| *:?-+:? *)*(?:\| *)?)(?:\n((?:(?! *\n| {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)| {0,3}#{1,6}(?:\s|$)| {0,3}>| {0,3}(?:`{3,}|~{3,})| {0,3}(?:[*+-]|\d{1,9}[.)]) | {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ \t\n\/>]|$)).*(?:\n|$))*)\n*|$)/.exec(src);
    if(!m) return; if(!/[:|]/.test(m[2])) return;
    const header = splitCells(m[1]); const alignS = m[2].replace(/^\||\| *$/g,'').split('|');
    if(header.length !== alignS.length) return;
    const align = alignS.map(s=>{ if(/^ *-+: *$/.test(s)) return 'right'; if(/^ *:-+: *$/.test(s)) return 'center'; if(/^ *:-+ *$/.test(s)) return 'left'; return null; });
    const token={type:'table',raw:trimEndChar(m[0],'\n'),header:[],align,rows:[]};
    for(let j=0;j<header.length;j++){ const cell={text:header[j],tokens:[],header:true,align:align[j]}; token.header.push(cell); this.inlineQueue.push({src:header[j],tokens:cell.tokens}); }
    const body = (m[3]||'').replace(/\n[ \t]*$/,''); if(body){ const rows = body.split('\n'); for(const r of rows){ if(!r) continue; const cells=splitCells(r, header.length); const row=[]; for(let j=0;j<cells.length;j++){ const cell={text:cells[j],tokens:[],header:false,align:align[j]}; row.push(cell); this.inlineQueue.push({src:cells[j],tokens:cell.tokens}); } token.rows.push(row); } }
    return token;
  }
  tokenLHeading(src){
    // Reject blocks without an underline before running the full setext grammar.
    let pos=src.indexOf('\n'),underline=false;
    while(pos!==-1){
      const start=pos+1,end=src.indexOf('\n',start);
      const line=src.slice(start,end===-1?src.length:end);
      if(/^[ \t]*$/.test(line))break;
      if(/^ {0,3}(?:=+|-+)[ \t]*$/.test(line)){underline=true;break;}
      // These blocks interrupt any possible setext heading.
      if(/^ {0,3}(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,}|(?:[*+-]|\d{1,9}[.)]) )/.test(line))break;
      pos=end;
    }
    if(!underline)return;
    const m=block.lheading.exec(src); if(!m) return;
    // basic exclusions
    if(/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})$/.test(m[1])) return;
     const text=m[1].replace(/^ {0,3}/,'').replace(/[ \t]+$/,'');
    const raw=trimEndChar(m[0],'\n'); const depth=m[2].charAt(0)==='='?1:2;
    const tok={type:'heading',raw,depth,text,tokens:[]}; this.inlineQueue.push({src:text,tokens:tok.tokens}); return tok;
  }
  tokenParagraph(src){
    let pos=0,out='',first=true;
    while(pos<src.length){
      const nl=src.indexOf('\n',pos); const line=nl===-1?src.slice(pos):src.slice(pos,nl); const end=nl===-1?src.length:nl+1;
      const initial=line.charCodeAt(0);
      if(initial>=65&&initial<=90||initial>=97&&initial<=122){out+=src.slice(pos,end);pos=end;first=false;continue;}
      if(!first){
        if(/^[ \t]*$/.test(line)&&!(nl===-1&&line.length)) break;
        if(/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})[ \t]*$/.test(line)) break;
        if(/^ {0,3}#{1,6}(?:\s|$)/.test(line)) break;
        if(/^ {0,3}>/.test(line)) break;
        if(/^ {0,3}(?:`{3,}(?=[^`\n]*(?:\n|$))|~{3,})/.test(line)) break;
      if(/^ {0,3}(?:[*+-]|1[.)])[ \t]+\S/.test(line)) break;
        if(/^ {0,3}<(?:script|pre|style|textarea)(?:[\s>]|$)/i.test(line)) break;
        if(/^ {0,3}<!--/.test(line)) break; if(/^ {0,3}<\?/.test(line)) break; if(/^ {0,3}<![A-Z]/.test(line)) break; if(/^ {0,3}<!\[CDATA\[/.test(line)) break;
        if(/^ {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ \t]+|$|\/?>)/i.test(line)) break;
        // table
        if(/^ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*[ \t]*$/.test(line) && out.indexOf('\n')===out.length-1 ? out.slice(0,-1).indexOf('\n')===-1 : out.indexOf('\n')===-1){
          // if previous is single line and looks like header
           if(/\|/.test(out)&&splitCells(out.trimEnd()).length===line.replace(/^ *\||\| *$/g,'').split('|').length) break;
        }
        if(/^ {0,3}(=+|-+)[ \t]*$/.test(line) && (out.indexOf('\n')===-1 || out.indexOf('\n')===out.length-1)) break;
      } else { if(/^[ \t]*$/.test(line)) return null; }
      out += src.slice(pos,end); pos=end; first=false; if(nl===-1) break;
    }
    if(!out) return null; const raw=out; const text = raw.endsWith('\n')?raw.slice(0,-1):raw;
    const tok={type:'paragraph',raw,text,tokens:[]}; this.inlineQueue.push({src:text,tokens:tok.tokens}); return tok;
  }
  tokenText(src){ const m=block.text.exec(src); if(m){ const tok={type:'text',raw:m[0],text:m[0],tokens:[]}; this.inlineQueue.push({src:tok.text,tokens:tok.tokens}); return tok; } }

  inlineTokens(src,tokens=[]){
    const original=src;
    const hasEmail=src.includes('@');
    const boundary=hasEmail?textBoundary:textBoundaryNoEmail;
    boundary.lastIndex=0;
    const firstBoundary=boundary.exec(src);
    if(!firstBoundary){
      if(src){const last=tokens[tokens.length-1];if(last&&last.type==='text'){last.raw+=src;last.text+=src;}else tokens.push({type:'text',raw:src,text:src});}
      return tokens;
    }
    if(firstBoundary.index){
      const raw=src.slice(0,firstBoundary.index),last=tokens[tokens.length-1];
      if(last&&last.type==='text'){last.raw+=raw;last.text+=raw;}
      else tokens.push({type:'text',raw,text:raw});
      src=src.slice(firstBoundary.index);
    }
    let masked;
    while(src){
      let m;
      const ch=src.charCodeAt(0);
      if(ch===92 && (m=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/.exec(src))){ tokens.push({type:'escape',raw:m[0],text:m[1]}); src=src.slice(m[0].length); continue; }
      // autolink <...>
      if(ch===60 && (m=/^<([a-zA-Z][a-zA-Z0-9+.\-]{1,31}:[^\s\x00-\x1f<>]*|[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_]))>/.exec(src))){
        const url=m[1]; let text,href; if(m[2]){text=url; href='mailto:'+text;} else {text=url; href=text;}
        tokens.push({type:'link',raw:m[0],text,href,tokens:[{type:'text',raw:text,text}],autolink:true}); src=src.slice(m[0].length); continue;
      }
      // inline html
      if(ch===60 && ((m=/^<!--(?:-?>|[\s\S]*?-->)/.exec(src)) || (m=/^<\?[\s\S]*?\?>/.exec(src)) || (m=/^<![A-Za-z]+\s[\s\S]*?>/.exec(src)) || (m=/^<!\[CDATA\[[\s\S]*?\]\]>/.exec(src)) || (m=/^<\/[a-zA-Z][a-zA-Z0-9-]*\s*>/.exec(src)) || (m=/^<[a-zA-Z][a-zA-Z0-9-]*(?:\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?)*\s*\/?>/.exec(src)))){
        const raw=m[0]; if(!this.state.inLink && /^<a /i.test(raw)) this.state.inLink=true; else if(this.state.inLink && /^<\/a>/i.test(raw)) this.state.inLink=false;
        if(!this.state.inRawBlock && /^<(pre|code|kbd|script)(\s|>)/i.test(raw)) this.state.inRawBlock=true; else if(this.state.inRawBlock && /^<\/(pre|code|kbd|script)(\s|>)/i.test(raw)) this.state.inRawBlock=false;
        tokens.push({type:'html',raw,inLink:this.state.inLink,inRawBlock:this.state.inRawBlock,block:false,text:raw}); src=src.slice(raw.length); continue;
      }
      // link
      if((ch===91 || ch===33) && (m=this.matchLink(src))){ const tok=outputLink(m.cap, m.link, m.cap[0], this); if(tok===null){ // backpedal emitted? treat as text of first char
          tokens.push({type:'text',raw:src[0],text:src[0]}); src=src.slice(1); continue;
        } tokens.push(tok); src=src.slice(tok.raw.length); continue; }
      // reflink
      if((ch===91 || ch===33) && (m=this.matchReflink(src))){ if(m.link){ const tok=outputLink(m.cap, m.link, m.cap[0], this); if(tok===null){tokens.push({type:'text',raw:src[0],text:src[0]}); src=src.slice(1); continue;} tokens.push(tok); src=src.slice(tok.raw.length); continue; } else { // not a def, consume first char as text? marked does: return {type:'text',raw:o,text:o} for first char
          const ch=m.cap[0].charAt(0); tokens.push({type:'text',raw:ch,text:ch}); src=src.slice(1); continue; } }
      // em/strong
      if(ch===42 || ch===95){
        // Whitespace after an opening run cannot begin emphasis; avoid masking
        // the entire inline source for such literal delimiter runs.
        let run=1;while(src.charCodeAt(run)===ch)run++;
        const after=src[run];
        if(!after||whitespace(after)){
          const raw=src.slice(0,run),last=tokens[tokens.length-1];
          if(last&&last.type==='text'){last.raw+=raw;last.text+=raw;}
          else tokens.push({type:'text',raw,text:raw});
          src=src.slice(run);continue;
        }
        if(masked===undefined){
          if(!/[`\\[<]/.test(original))masked=original;
          else {
          const prepared=/[`\\]/.test(original)?original.replace(/(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\([\p{P}\p{S}])/gu,(m,run,p)=>p?'+'.repeat(m.length):run?run+m.slice(run.length,-run.length).replace(/`/g,'+')+run:m):original;
          masked=/[`[<]/.test(prepared)?prepared.replace(/\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\()]|\((?:\\[\s\S]|[^\\()])*\))*\)|(?<!`)(?<b>`+)[^`]+\k<b>(?!`)|<(?! )[^<>]*?>/g,m=>'['+'a'.repeat(m.length-2)+']'):prepared;
          }
        }
        if((m=this.matchEmStrong(src,run,original,masked))){ tokens.push(m); src=src.slice(m.raw.length); continue; }
      }
      // codespan
      if(ch===96 && (m=inlineCodePattern.exec(src))){ let text=m[2].replace(/\n/g,' '); const ns=/[^ ]/.test(text), sb=text.charCodeAt(0)===32&&text.charCodeAt(text.length-1)===32; if(ns&&sb) text=text.substring(1,text.length-1); tokens.push({type:'codespan',raw:m[0],text}); src=src.slice(m[0].length); continue; }
      // br
      if((ch===32 || ch===92) && (m=/^( {2,}|\\)\n(?!\s*$)[ \t]*/.exec(src))){ tokens.push({type:'br',raw:m[0]}); src=src.slice(m[0].length); continue; }
      // del
      if(ch===126 && (m=this.matchDel(src))){tokens.push(m);src=src.slice(m.raw.length);continue;}
      // url autolink gfm
      if(!this.state.inLink && (hasEmail || ch===104 || ch===72 || ch===102 || ch===70 || ch===119 || ch===87) && (m=this.matchUrl(src))){ tokens.push(m); src=src.slice(m.raw.length); continue; }
      // text
      const raw=this.matchText(src,hasEmail);
      if(raw){ const last=tokens[tokens.length-1]; if(last&&last.type==='text'){ last.raw+=raw; last.text+=raw; } else tokens.push({type:'text',raw,text:raw}); src=src.slice(raw.length); continue; }
      if(src) throw new Error('Infinite loop inline: '+src.charCodeAt(0));
    }
    return tokens;
  }
  matchLink(src){
    const cap=/^!?\[((?:\[(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?)\]\([ \t\n]*(<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\)))(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\)))?[ \t\n]*\)/.exec(src);
    if(!cap)return null;
    return this.matchLinkFull(src,cap[1]);
  }
  matchLinkFull(src,label){
    // manual parse for correctness
    if(src[0]!=='[' && !(src[0]==='!' && src[1]==='[')) return null;
    const isImg = src[0]==='!'; let i = isImg?1:0; if(src[i]!=='[') return null; i++;
    // label
    const endLabel=i+label.length;
    if(labelCrossesHtml(src,label,i))return null;i=endLabel+1;
    if(src[i]!=='(') return null; i++;
    // href+title
    let href=''; let title=undefined;
    // skip leading spaces/newlines
    while(i<src.length && (src[i]===' '||src[i]==='\t'||src[i]==='\n')) i++;
    if(i<src.length && src[i]==='<'){
      const hrefStart=++i; while(i<src.length && src[i]!=='>'){ if(src[i]==='\n'||src[i]==='<')return null; i+=src[i]==='\\'?2:1; } if(i>=src.length) return null; href=src.slice(hrefStart,i); i++;
    } else {
      // read until whitespace or ) handling parens
      const hrefStart=i;let pd=0; while(i<src.length){ const c=src[i]; if(c==='\\'){ i+=2; continue; } if((c===' '||c==='\t'||c==='\n') && pd===0) break; if(c==='(') { pd++; i++; continue; } if(c===')'){ if(pd===0) break; pd--; i++; continue; } i++; }href=src.slice(hrefStart,i);
    }
    // title
    while(i<src.length && (src[i]===' '||src[i]==='\t'||src[i]==='\n')) i++;
    if(i<src.length && src[i]!==')'){
      const q=src[i]; if(q==='"'||q==="'"||q==='('){ const end=q==='('?')':q; const titleStart=++i; while(i<src.length && src[i]!==end) i+=src[i]==='\\'?2:1; if(i>=src.length) return null; title=src.slice(titleStart,i); i++; while(i<src.length && /[ \t\n]/.test(src[i])) i++; }
    }
    if(i>=src.length || src[i]!==')') return null; i++;
    const raw=src.slice(0,i);
    if(href.includes('\\')) href = href.replace(/\\([\p{P}\p{S}])/gu,'$1');
    if(title!=null && title.includes('\\')) title = title.replace(/\\([\p{P}\p{S}])/gu,'$1');
    const cap=[raw,label,href,title];
    return {cap, link:{href,title}};
  }
  matchReflink(src){
    if(src[0]!=='[' && !(src[0]==='!' && src[1]==='[')) return null;
    const m=/^!?\[((?:\[(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?)\]\[((?!\s*\])(?:\\[\s\S]|[^\[\]\\\n]|\n(?![ \t]*\n))+)\]/.exec(src)||/^!?\[((?!\s*\])(?:\\[\s\S]|[^\[\]\\\n]|\n(?![ \t]*\n))+)\](?:\[\])?/.exec(src);
    if(!m||labelCrossesHtml(src,m[1],src[0]==='!'?2:1))return null;
    const raw=m[0],label=m[1],ref=m[2]||label; const key=ref.trim().replace(/\s+/g,' ').toLowerCase().replace(/ß/g,'ss'); const link=this.tokens.links[key];
    if(!link) return {cap:[raw,label], link:null};
    return {cap:[raw,label,link.href,link.title], link};
  }
  matchDel(src){
    const m=/^(~~?)(?=[^\s~])/.exec(src);if(!m)return;
    const size=m[1].length;let balance=1;
    for(let i=size;i<src.length;i++)if(src[i]==='\\'){i++;}else if(src[i]==='~'){
      let end=i;while(src[end]==='~')end++;if(end-i!==size){i=end-1;continue;}
      const before=src[i-1],after=src[end];
      if(!/\s/.test(before)&&(!after||/[\s\p{P}\p{S}]/u.test(after))){if(!--balance){const raw=src.slice(0,end),text=raw.slice(size,-size);return {type:'del',raw,text,tokens:this.inlineTokens(text,[])};}}
      else if(after&&!/\s/.test(after))balance++;
      i=end-1;
    }
  }
  matchEmStrong(src,count,original,masked=original){
    const ch=src[0], offset=original.length-src.length;
    let begin=offset;while(begin>0&&original[begin-1]===ch)begin--;
    const before=precedingChar(original,begin), first=emphasisFlags(ch,before,src[count]);
    if(!(first&1)) return;
    let balance=count, skipped=0;
    for(let i=count;i<src.length;){
      emphasisBoundary.lastIndex=i;
      const next=emphasisBoundary.exec(src);if(!next)break;i=next.index;
      if(masked[offset+i]!==original[offset+i]){i++;continue;}
      if(src[i]==='\\'){i+=2;continue;}
      if(src[i]==='<'){const html=inlineHtmlPattern.exec(src.slice(i));if(html){i+=html[0].length;continue;}}
      if(src[i]==='['||src[i]==='!'){const link=this.matchLink(src.slice(i));if(link){i+=link.cap[0].length;continue;} const ref=this.matchReflink(src.slice(i));if(ref?.link){i+=ref.cap[0].length;continue;}}
      if(ch==='*'&&src[i]==='_'&&src[i+1]==='_'){const close=src.indexOf('__',i+2);if(close!==-1){i=close+2;continue;}}
      if(src[i]==='`'){const code=inlineCodePattern.exec(src.slice(i));if(code){i+=code[0].length;continue;}}
      if(src[i]!==ch){i++;continue;}
      let end=i;while(src[end]===ch)end++;
      const n=end-i, f=emphasisFlags(ch,precedingChar(src,i),src[end]);
      if(f===1){balance+=n;i=end;continue;}
      if(f&2){
        if(((first&2)||(f&1))&&(count+n)%3===0&&(count%3!==0||n%3!==0)){skipped+=n;i=end;continue;}
        balance-=n;
        if(balance<=0){const used=Math.min(n,n+balance+skipped), size=Math.min(count,used)%2?1:2; const raw=src.slice(0,i+used),text=raw.slice(size,-size);return {type:size===1?'em':'strong',raw,text,tokens:this.inlineTokens(text,[])};}
      }
      i=end;
    }
  }
  matchUrl(src){
    if(/^www\./i.test(src)&&!/^www\./.test(src))return;
    const scheme=/^(mailto:|xmpp:)([A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-]))/i.exec(src);
    if(scheme){let raw=scheme[0];if(/^xmpp:/i.test(raw)){const resource=/^\/[^\s/<>]+/.exec(src.slice(raw.length));if(resource)raw+=resource[0];}return {type:'link',raw,text:raw,href:raw,tokens:[{type:'text',raw,text:raw}],autolink:true};}
    const m=/^(https?:\/\/[^\s<]+|ftp:\/\/[^\s<]+|www\.[^\s<]+|[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-]))/i.exec(src);
    if(!m) return null; let raw=m[0],text,href;
    if(m[2]){ text=raw; href='mailto:'+text; }
    else {
      // backpedal trailing punctuation
      // marked's backpedal is specific
      let r=raw; let prev; do{ prev=r; r=(/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/.exec(r)||[''])[0]; } while(r!==prev);
      raw=r; text=raw; if(/^www\./.test(text)) href='http://'+text; else href=text;
    }
    return {type:'link',raw,text,href,tokens:[{type:'text',raw:text,text}],autolink:true};
  }
  matchText(src,hasEmail){
    if(src.charCodeAt(0)===96){let end=1;while(src.charCodeAt(end)===96)end++;return src.slice(0,end);}
    // consume up to special
    const boundary=hasEmail?textBoundary:textBoundaryNoEmail;
    boundary.lastIndex=1;
    const m=boundary.exec(src);
    const raw=m?src.slice(0,m.index):src;
    return raw;
  }
}

class Parser {
  constructor(lexer){ this.lexer=lexer; }
  parse(tokens){ let out=''; for(let i=0;i<tokens.length;i++) out+=this.tok(tokens[i]); return out; }
  tok(t){
    switch(t.type){
      case 'space': return '';
      case 'hr': return '<hr>\n';
      case 'heading': return `<h${t.depth}>${this.inline(t.tokens)}</h${t.depth}>\n`;
      case 'code': { const text=t.text?t.text.replace(/\n$/,'')+'\n':''; return '<pre><code'+(t.lang?' class="language-'+escape(t.lang.split(/\s+/)[0])+'"':'')+'>'+escape(text,true)+'</code></pre>\n'; }
      case 'blockquote': return '<blockquote>\n'+this.parse(t.tokens)+'</blockquote>\n';
      case 'html': return t.text;
      case 'def': return '';
      case 'paragraph': return '<p>'+this.inline(t.tokens)+'</p>\n';
      case 'text': return t.tokens ? this.inline(t.tokens) : escape(t.text);
      case 'list': return this.list(t);
      case 'table': return this.table(t);
      case 'checkbox': return this.itok(t);
      default: return '';
    }
  }
  list(t){ const tag=t.ordered?'ol':'ul'; const start=(t.ordered&&t.start!==1)?` start="${t.start}"`:''; let body=''; for(const it of t.items) body+=this.listitem(it,t); return `<${tag}${start}>\n${body}</${tag}>\n`; }
  listitem(item,list){
    let inner = this.parse(item.tokens);
    // trim trailing single newline inside li? marked keeps block formatting; but join
    return `<li>${inner}</li>\n`;
  }
  table(t){
    let head=''; let hr=''; for(const c of t.header) hr+=this.cell(c); head += `<tr>\n${hr}</tr>\n`;
    let body=''; for(const row of t.rows){ let rr=''; for(const c of row) rr+=this.cell(c); body += `<tr>\n${rr}</tr>\n`; }
    if(body) body = `<tbody>${body}</tbody>`;
    return `<table>\n<thead>\n${head}</thead>\n${body}</table>\n`;
  }
  cell(c){ const tag=c.header?'th':'td'; const al=c.align?` align="${c.align}"`:''; return `<${tag}${al}>${this.inline(c.tokens)}</${tag}>\n`; }
  inline(tokens){ let out=''; for(const t of tokens)out+=this.itok(t); return out; }
  plain(tokens){let out='';for(const t of tokens)out+=t.tokens?this.plain(t.tokens):t.type==='br'?'':t.text||'';return out;}
  itok(t){
    switch(t.type){
      case 'escape': return escape(t.text); // escaped chars rendered as literal in output context? marked: text renderer returns t.text, html renderer escape? inline parser for escape token -> renderer.text(t) in parseInline? wait: case "escape":{n+=t.text(o);break} and TextRenderer.text returns e.text, Renderer has no escape method; parseInline default uses renderer (Renderer) which inherits? no, Renderer doesn't have text returning escaped except for text tokens. escape token -> t.text(o) means call renderer.text. Renderer doesn't define text for escape differently; Parser.parseInline: case "escape":{n+=t.text(o);break} - t here is the renderer passed as second arg (default this.renderer). Renderer class has no text method, so uses? in minified: C (Renderer) has no text, E (TextRenderer) has. parseInline uses t param defaulting to this.renderer but for escape does n+=t.text(o) - that would fail if Renderer lacks text. But in code: "case \"escape\":{n+=t.text(o);break}" and Renderer prototype in minified: space,code,blockquote,html,def,heading,hr,list,listitem,checkbox,paragraph,table,tablerow,tablecell,strong,em,codespan,br,del,link,image,text. Yes has text: `text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:P(e.text)}`. So for escape token (type escape, raw '\\!', text '!') rendering via renderer.text: escape token has no tokens, no escaped flag set to true in same way? tokenizer.escape returns {type:'escape',raw:t[0],text:t[1]} so renderer.text will take else branch: escape token not having tokens/escaped -> returns P(e.text) which escapes &,<,>,"' etc. But text is '!' so safe. For escaped backslash in text context marked may behave specifically.
      case 'html': return t.text;
      case 'link': { const href=cleanUrl(t.href); if(href===null) return this.inline(t.tokens); let o='<a href="'+escape(href)+'"'; if(t.title!=null) o+=' title="'+escape(t.title)+'"'; o+='>'+this.inline(t.tokens)+'</a>'; return o; }
      case 'image': { const href=cleanUrl(t.href); const text=t.tokens?this.plain(t.tokens):t.text; if(href===null) return escape(text); let o='<img src="'+escape(href)+'" alt="'+escape(text)+'"'; if(t.title!=null) o+=' title="'+escape(t.title)+'"'; o+='>'; return o; }
      case 'strong': return '<strong>'+this.inline(t.tokens)+'</strong>';
      case 'em': return '<em>'+this.inline(t.tokens)+'</em>';
      case 'codespan': return '<code>'+escape(t.text,true)+'</code>';
      case 'br': return '<br>';
      case 'del': return '<del>'+this.inline(t.tokens)+'</del>';
      case 'text': return t.escaped ? t.text : escape(decodeEntities(t.text));
      case 'checkbox': return '<input '+(t.checked?'checked="" ':'')+'disabled="" type="checkbox"> ';
      default: return '';
    }
  }
}
