(()=>{var p="openchamber.sdk";var Ee="data-oc-scrolling",Le=`
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [${Ee}] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [${Ee}] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [${Ee}]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [${Ee}] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;function Ut(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let s=new WeakMap;e.addEventListener("scroll",m=>{let E=m.target===e?r:m.target;if(!(E instanceof Element))return;E.hasAttribute("data-oc-scrolling")||E.setAttribute("data-oc-scrolling","");let O=s.get(E);O!==void 0&&clearTimeout(O),s.set(E,setTimeout(()=>{s.delete(E),E.removeAttribute("data-oc-scrolling")},1e3))},{capture:!0,passive:!0})}var Ao=`(${Ut.toString()})(document);`;var Lt=/^[a-z][a-z0-9-]{0,39}$/;var It=e=>Object(e)===e&&!Array.isArray(e),Ge=(e,r)=>Object.keys(e).every(s=>r.includes(s)),Ct=e=>String(e)===e&&e.length>=1&&e.length<=60,Mt=e=>String(e)===e&&e.length>=1&&e.length<=80,Gt=e=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!It(s)||!Lt.test(s.id)||!Ct(s.label)||s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1||r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!Ge(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!Ge(s,["kind","id","label","value","options","disabled"])||!Mt(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let m=new Set;for(let E of s.options){if(!It(E)||!Ge(E,["value","label"])||!Mt(E.value)||!Ct(E.label)||m.has(E.value))return!1;m.add(E.value)}if(!m.has(s.value))return!1}return!0};var Ne=e=>"bytes"in e?e.bytes.byteLength:e.content.length,Nt=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0};var Pt=/^[A-Za-z0-9_-]{1,80}$/;var Dt=["left","right","top","bottom"];var Ht=(e,r=0,s={remaining:16e3})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let m=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let E of m)if(!Ht(E,r+1,s))return!1;return!0},Pe=e=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every(r=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(Pe);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(Pe)}return String(e)===e||Number.isFinite(e)},De=e=>{try{return String(e.id)!==e.id||!Pt.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!Dt.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!Ht(e.data)||!Pe(e.data)?!1:JSON.stringify(e.data).length<=16e3}catch{return!1}};var Ft=["file","directory","other","missing"],$e=e=>!!(e&&"sessionId"in e),Fe=e=>!!(e&&"sent"in e&&!("sessionId"in e));var Xt=/^[0-9a-f]{7,64}$/i,Xe=e=>Xt.test(e),fe=500,_e=32e3,Bt=16e3,Vt=128,zt=200,jt=2e3,Kt=16e3,Wt=80,Jt=200,Yt=16e3;var Qt=2e3;var Be=2e4,Se=1024,Te=2e6;var me=64e3,he=8e3,Ve=4e3;var ze=9e4;var Zt=999,qt=1e4,ne=500,eo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],to=["stopped","starting","ready","failed"],bo=new Set(eo),oo=e=>bo.has(e),ro=e=>e&&oo(e)?e:"HOST_REJECTED",K=e=>e===void 0?!1:e===null||e===!0||e===!1||String(e)===e?!0:Number(e)===e?Number.isFinite(e):Array.isArray(e)?e.every(K):Object(e)===e?Object.values(e).every(K):!1,no=e=>K(e)&&JSON.stringify(e).length<=Yt,$t=e=>e?.trim().slice(0,Jt)??"",W=e=>{let r=e.id.trim().slice(0,Vt),s=e.title.trim().slice(0,zt),m=e.url.trim().slice(0,jt),E=e.text?.trim().slice(0,Kt),O=e.author?.trim().slice(0,Wt),D=e.kind==="pull"?"pull":"issue",C={providerId:e.providerId.trim(),id:r,title:s||r,url:m,kind:D};if(E&&(C.text=E),O&&(C.author=O),D==="pull"){let H=$t(e.branches?.head),$=$t(e.branches?.base);H&&$&&(C.branches={head:H,base:$})}return no(e.data)&&(C.data=e.data),C},je=e=>{let r=W(e);return e.projectId&&(r.projectId=e.projectId),e.navigation&&(r.navigation=e.navigation),e.worktree&&(r.worktree=e.worktree),r},Ke=e=>{let r={text:e.text.trim().slice(0,Bt)};return e.send&&(r.send=!0),r},We=e=>e===null||!Number.isFinite(e)?null:Math.min(Zt,Math.max(0,Math.round(e))),Je=e=>Number.isFinite(e)?Math.min(qt,Math.max(0,Math.ceil(e))):0;var J=e=>e.length>0&&e.length<=Se&&!e.includes("\0")&&!e.includes("\\");var xe=e=>!e.startsWith("/")||e.includes("\0")||e.includes("\\")||e.includes("://")||e.length>Qt?!1:!e.split("/").some(s=>s==="."||s===".."),ko=new Set(to),Ye=e=>!!(e&&"status"in e&&ko.has(String(e.status))&&!("body"in e)),Ae=e=>!!(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),Qe=e=>!!(e&&"content"in e&&String(e.content)===e.content),Ze=e=>!!(e&&"written"in e&&e.written===!0),qe=e=>!!(e&&"entries"in e&&Array.isArray(e.entries)),go=new Set(Ft),et=e=>!!(e&&"kind"in e&&"size"in e&&go.has(String(e.kind))&&Number.isFinite(e.size)),tt=e=>!!(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),yo=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","status-control-event","popover-closed","file-open","file-snapshot","file-saved"]),Oo=e=>Object(e)===e?e:null,He=e=>String(e)===e&&e.length>0,vo=e=>{if(!He(e.id))return null;if(e.ok===!0){let r={channel:p,v:1,type:"result",id:e.id,ok:!0};return Object(e.payload)===e.payload&&(r.payload=e.payload),r}return e.ok===!1&&He(e.error)?{channel:p,v:1,type:"result",id:e.id,ok:!1,error:e.error,code:ro(He(e.code)?e.code:void 0)}:null},ot=e=>{let r=Oo(e);return!r||r.channel!==p||r.v!==1?null:r.type==="result"?vo(r):!yo.has(String(r.type))||Object(r.payload)!==r.payload?null:r};var so=e=>"key"in e&&"metaKey"in e&&"ctrlKey"in e,Ro=e=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s",a=class extends Error{code;constructor(r,s){super(s),this.name="HostRequestError",this.code=r}},io=()=>Promise.reject(new a("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),be=()=>Promise.reject(new a("BAD_PATH",`File path must be 1 to ${Se} characters without NUL or backslash.`)),ke=e=>{if(e!==void 0){if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new a("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0}},l=e=>(e.value+=1,`oc-${e.value}`),at=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new a("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.acceptSource??(t=>t===r.parent),m=e.requestTimeoutMs??Be,E=new Set,O=new Set,D=new Set,C=new Set,H=new Set,$=new Set,Q=new Set,ie=new Set,ae=new Set,Z=null,q=null,ce=new Set,de=new Set,ee=null,te=null,Ue=!1,V=new Map,z=new Map,j=new Map,L=!1,d={value:0},c=null,G=null,oe=!1,re=!1,ht=null,xt=t=>t?{sessionId:t.id,phase:t.busy?"started":"completed"}:null,U=t=>{r.parent.postMessage(t,"*")},b=(t,o)=>{for(let n of t)try{n(o)}catch(i){console.error(i)}},At=t=>{if(!(t instanceof MessageEvent)||!s(t.source))return;let o=ot(t.data);if(!o)return;if(o.type==="workspace"){let i=z.get(o.payload.subscriptionId);i&&b([i],o.payload.snapshot);return}if(o.type==="shells"){let i=j.get(o.payload.subscriptionId);i&&b([i],o.payload.snapshot);return}if(o.type==="ready"){c=o.payload,G=xt(o.payload.session),b(E,o.payload),b(O,o.payload.directory),b(D,o.payload.session),G&&b(C,G),b(H,o.payload.connection),b($,o.payload.settings),b(Q,o.payload.item);return}if(o.type==="directory"){c&&(c={...c,directory:o.payload.directory}),b(O,o.payload.directory);return}if(o.type==="session"){c&&(c={...c,session:o.payload.session}),o.payload.session?G?.sessionId!==o.payload.session.id&&(G=xt(o.payload.session)):G=null,b(D,o.payload.session);return}if(o.type==="session-lifecycle"){G=o.payload,b(C,o.payload);return}if(o.type==="connection"){c&&(c={...c,connection:o.payload.connection}),b(H,o.payload.connection);return}if(o.type==="settings"){c&&(c={...c,settings:o.payload.settings}),b($,o.payload.settings);return}if(o.type==="item"){c&&(c={...c,item:o.payload.item}),b(Q,o.payload.item);return}if(o.type==="status-control-event"){b(ie,o.payload);return}if(o.type==="popover-closed"){b(ae,o.payload);return}if(o.type==="action"){let i=f=>{L||U({channel:p,v:1,type:"action-result",id:o.id,payload:f})},_=q;if(!_){i({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>_(o.payload)).then(()=>i({ok:!0}),f=>{let A=(f instanceof Error?f.message:String(f)).trim();i({ok:!1,error:(A||"Action failed.").slice(0,ne)})});return}if(o.type==="file-open"){let i=o.payload;if(te&&Nt(te,i))return;te=i,b(ce,o.payload);return}if(o.type==="file-saved"){b(de,o.payload.version);return}if(o.type==="file-snapshot"){let i=A=>{L||U({channel:p,v:1,type:"file-snapshot-result",id:o.id,payload:A})},_=A=>i({error:(A.trim()||"Could not read the edited file.").slice(0,ne)}),f=ee;if(!f){_("This extension does not edit files.");return}Promise.resolve().then(()=>f(o.payload.purpose)).then(A=>{if(Ne(A)>2e7){_(`The file is over ${2e7} ${"bytes"in A?"bytes":"characters"}.`);return}if(A.version.length>256){_(`The snapshot version is over ${256} characters.`);return}i({snapshot:"bytes"in A?{bytes:A.bytes,version:A.version}:{content:A.content,version:A.version}})},A=>_(A instanceof Error?A.message:String(A)));return}if(o.type==="resolve"){let i=f=>{U({channel:p,v:1,type:"resolve-result",id:o.id,payload:f})},_=Z;if(!_){i({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>_(o.payload)).then(f=>i({item:f?W(f):null}),f=>{let A=(f instanceof Error?f.message:String(f)).trim();i({error:(A||"Command failed.").slice(0,ne)})});return}let n=V.get(o.id);if(n){if(clearTimeout(n.timer),V.delete(o.id),o.ok){n.resolve(o.payload);return}n.reject(new a(o.code,o.error))}};r.addEventListener("message",At),U({channel:p,v:1,type:"hello"});let g=(t,o=m)=>L||r.parent===r?Promise.reject(new a("HOST_UNAVAILABLE","No host frame. This page is not in an iframe.")):new Promise((n,i)=>{let _=setTimeout(()=>{V.delete(t.id),i(new a("HOST_TIMEOUT","Host did not answer in time."))},o);V.set(t.id,{resolve:n,reject:i,timer:_}),U(t)}),h=t=>g(t).then(()=>{}),x={channel:p,v:1},Ie=t=>{!L&&r.parent!==r&&U(t)},bt=()=>Ie({...x,type:"file-save"}),kt=t=>{!so(t)||!Ro(t)||(t.preventDefault(),bt())},gt=t=>{!so(t)||t.key!=="Escape"||c?.surface!=="popover"||!c.popover||(t.preventDefault(),Rt(c.popover.id,"escape").catch(()=>{}))},le=()=>{let t=c?.surface==="popover"?c.popover:void 0;if(!t)return;let o=oe||re;ht!==o&&(ht=o,wt(t.id,o).catch(()=>{}))},pe=()=>{c?.surface!=="popover"||oe||(oe=!0,le())},yt=t=>{c?.surface!=="popover"||t.relatedTarget!==null||!oe||(oe=!1,le())},Ot=()=>{c?.surface!=="popover"||re||(re=!0,le())},vt=()=>{c?.surface!=="popover"||!re||(re=!1,le())},M=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new a("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},Ce=async t=>{t.kind!=="projects"&&M(t.projectId);let o=await g({...x,type:"workspace-read",id:l(d),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new a("HOST_REJECTED","Host did not return workspace data.");return o},Me=async(t,o)=>{t.kind!=="projects"&&M(t.projectId);let n=l(d);z.set(n,o);try{await h({...x,type:"workspace-subscribe",id:l(d),payload:{subscriptionId:n,query:t}})}catch(i){throw z.delete(n),L||U({...x,type:"workspace-unsubscribe",id:l(d),payload:{subscriptionId:n}}),i}return()=>{!z.delete(n)||L||U({...x,type:"workspace-unsubscribe",id:l(d),payload:{subscriptionId:n}})}},xo=async(t,o)=>{t.kind==="session"&&M(t.sessionId),t.kind==="project"&&M(t.projectId);let n=l(d);j.set(n,o);try{await h({...x,type:"shells-subscribe",id:l(d),payload:{subscriptionId:n,scope:t}})}catch(i){throw j.delete(n),L||U({...x,type:"shells-unsubscribe",id:l(d),payload:{subscriptionId:n}}),i}return()=>{!j.delete(n)||L||U({...x,type:"shells-unsubscribe",id:l(d),payload:{subscriptionId:n}})}},ue=async t=>{if("key"in t&&(t.key.length===0||t.key.length>128))throw new a("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!K(t.value))throw new a("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>65536)throw new a("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&c?.features?.deviceStorage!==!0)throw new a("UNSUPPORTED","This host does not support device storage.");let o=await g({...x,type:"storage",id:l(d),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new a("HOST_REJECTED","Host did not return storage data.");return o},Rt=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):h({...x,type:"popover-close",id:l(d),payload:o?{id:t,reason:o}:{id:t}}),wt=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):h({...x,type:"popover-anchor",id:l(d),payload:{id:t,active:o}});return r.addEventListener("keydown",gt,!0),r.addEventListener("pointerover",pe),r.addEventListener("pointermove",pe),r.addEventListener("pointerout",yt),r.addEventListener("focus",Ot),r.addEventListener("blur",vt),{onAction:t=>(q=t,()=>{q===t&&(q=null)}),listProjects:async()=>{let t=await Ce({kind:"projects"});if(t.kind!=="projects")throw new a("HOST_REJECTED","Expected projects.");return t},listWorktrees:async t=>{let o=await Ce({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new a("HOST_REJECTED","Expected worktrees.");return o},listSessions:async t=>{let o=await Ce({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new a("HOST_REJECTED","Expected sessions.");return o},onProjects:t=>Me({kind:"projects"},o=>{o.kind==="projects"&&t(o)}),onWorktrees:(t,o)=>Me({kind:"worktrees",projectId:t},n=>{n.kind==="worktrees"&&o(n)}),onSessions:(t,o)=>Me({kind:"sessions",projectId:t},n=>{n.kind==="sessions"&&o(n)}),onRunningShells:(t,o)=>xo(t,o),readShellOutput:async(t,o)=>{M(t,128);let n=o?.cursor;if(n!==void 0&&(!Number.isInteger(n)||n<0))throw new a("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let i=o?.tailBytes;if(i!==void 0&&(!Number.isInteger(i)||i<1||i>65536))throw new a("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${65536}.`);let f=await g({...x,type:"shell-output",id:l(d),payload:{shellId:t,cursor:n,tailBytes:i}});if(!f||typeof f.output!="string"||!Number.isFinite(f.cursor))throw new a("HOST_REJECTED","Host did not return shell output.");return f},stopShell:async t=>{if(M(t,128),(await g({...x,type:"shell-stop",id:l(d),payload:{shellId:t}}))?.stopped!==!0)throw new a("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async t=>{M(t),await h({...x,type:"open-session",id:l(d),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let n=ke(o),i={op:"get",key:t};n&&(i.scope=n);let _=await ue(i);return _.op==="get"&&_.found?_.value:void 0},set:async(t,o,n)=>{let i=ke(n),_={op:"set",key:t,value:o};i&&(_.scope=i),await ue(_)},delete:async(t,o)=>{let n=ke(o),i={op:"delete",key:t};n&&(i.scope=n),await ue(i)},keys:async t=>{let o=ke(t),n={op:"keys"};o&&(n.scope=o);let i=await ue(n);if(i.op!=="keys")throw new a("HOST_REJECTED","Expected storage keys.");return i.keys}},onReady:t=>(E.add(t),c&&t(c),()=>{E.delete(t)}),onDirectory:t=>(O.add(t),c&&t(c.directory),()=>{O.delete(t)}),onSession:t=>(D.add(t),c&&t(c.session),()=>{D.delete(t)}),onSessionLifecycle:t=>(C.add(t),G&&t(G),()=>{C.delete(t)}),onConnection:t=>(H.add(t),c&&t(c.connection),()=>{H.delete(t)}),onSettings:t=>($.add(t),c&&t(c.settings),()=>{$.delete(t)}),onItem:t=>(Q.add(t),c&&t(c.item),()=>{Q.delete(t)}),onStatusControl:t=>(ie.add(t),()=>{ie.delete(t)}),onPopoverClosed:t=>(ae.add(t),()=>{ae.delete(t)}),setStatusControls:t=>c?.features?.statusControls!==!0?Promise.reject(new a("UNSUPPORTED","This host does not support status controls.")):Gt(t)?h({...x,type:"status-controls",id:l(d),payload:{controls:t}}):Promise.reject(new a("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options.")),openPopover:t=>c?.features?.popovers!==!0?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):De(t)?h({...x,type:"popover-open",id:l(d),payload:t}):Promise.reject(new a("HOST_REJECTED","Popover requests need bounded geometry and JSON data.")),closePopover:Rt,setPopoverAnchorActive:wt,onResolve:t=>(Z=t,()=>{Z===t&&(Z=null)}),toast:t=>{let o=t.message.trim();return!o||o.length>fe?Promise.reject(new a("HOST_REJECTED",`Toast message must contain 1 to ${fe} characters.`)):t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>_e)?Promise.reject(new a("HOST_REJECTED",`Toast copy text must contain 1 to ${_e} characters.`)):h({channel:p,v:1,type:"toast",id:l(d),payload:{...t,message:o}})},openUrl:t=>h({channel:p,v:1,type:"open-url",id:l(d),payload:{url:t}}),openCommit:t=>Xe(t)?h({channel:p,v:1,type:"open-commit",id:l(d),payload:{sha:t}}):Promise.reject(new a("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),openSurface:t=>h({channel:p,v:1,type:"open-surface",id:l(d),payload:{surfaceId:t}}),writeClipboard:t=>h({channel:p,v:1,type:"clipboard-write",id:l(d),payload:{text:t}}),compose:t=>h({channel:p,v:1,type:"compose",id:l(d),payload:t}),attach:t=>h({channel:p,v:1,type:"attach",id:l(d),payload:W(t)}),startSession:async t=>{t.projectId!==void 0&&M(t.projectId);let o=t.worktree;o&&o!==!0&&(o.kind==="existing"?M(o.directory):(o.name!==void 0&&M(o.name,200),o.baseBranch!==void 0&&M(o.baseBranch,200)));let n=await g({channel:p,v:1,type:"start-session",id:l(d),payload:je(t)},e.requestTimeoutMs??18e4);if(!$e(n))throw new a("HOST_REJECTED","Host did not return a session.");return n},prompt:t=>g({channel:p,v:1,type:"prompt",id:l(d),payload:Ke(t)}).then(o=>{if(!Fe(o))throw new a("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:t=>h({channel:p,v:1,type:"session-link",id:l(d),payload:W(t)}),close:()=>h({channel:p,v:1,type:"close",id:l(d)}),oauthStart:()=>h({channel:p,v:1,type:"oauth-start",id:l(d)}),oauthDisconnect:()=>h({channel:p,v:1,type:"oauth-disconnect",id:l(d)}),request:t=>(xe(t.path)?g({channel:p,v:1,type:"request",id:l(d),payload:t}):io()).then(o=>{if(!Ae(o))throw new a("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:t=>(xe(t.path)?g({channel:p,v:1,type:"service-request",id:l(d),payload:t}):io()).then(o=>{if(!Ae(o))throw new a("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>g({channel:p,v:1,type:"service-status",id:l(d)}).then(t=>{if(!Ye(t))throw new a("HOST_REJECTED","Host did not return service status.");return t}),readFile:t=>(J(t)?g({channel:p,v:1,type:"file-read",id:l(d),payload:{path:t}}):be()).then(o=>{if(!Qe(o))throw new a("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>J(t)?o.length>Te?Promise.reject(new a("FILE_TOO_LARGE",`Content is over ${Te} characters.`)):g({channel:p,v:1,type:"file-write",id:l(d),payload:{path:t,content:o}}).then(n=>{if(!Ze(n))throw new a("HOST_REJECTED","Host did not confirm the write.");return n}):be(),listDir:t=>(J(t)?g({channel:p,v:1,type:"file-list",id:l(d),payload:{path:t}}):be()).then(o=>{if(!qe(o))throw new a("HOST_REJECTED","Host did not return directory entries.");return o}),stat:t=>(J(t)?g({channel:p,v:1,type:"file-stat",id:l(d),payload:{path:t}}):be()).then(o=>{if(!et(o))throw new a("HOST_REJECTED","Host did not return file status.");return o}),generate:t=>{let o=t.prompt.trim(),n=t.system?.trim();if(o.length===0||o.length>me)return Promise.reject(new a("HOST_REJECTED",`Prompt must be 1 to ${me} characters.`));if(n!==void 0&&(n.length===0||n.length>he))return Promise.reject(new a("HOST_REJECTED",`System prompt must be 1 to ${he} characters.`));let i=t.maxOutputTokens===void 0?void 0:Math.min(Ve,Math.max(1,Math.floor(t.maxOutputTokens)));if(i!==void 0&&!Number.isFinite(i))return Promise.reject(new a("HOST_REJECTED","maxOutputTokens must be a number."));let _={prompt:o};return n!==void 0&&(_.system=n),i!==void 0&&(_.maxOutputTokens=i),g({channel:p,v:1,type:"generate",id:l(d),payload:_},e.requestTimeoutMs??ze).then(f=>{if(!tt(f))throw new a("HOST_REJECTED","Host did not return generated text.");return f})},setBadge:t=>h({channel:p,v:1,type:"badge",id:l(d),payload:{count:We(t)}}),setHeight:t=>h({channel:p,v:1,type:"resize",id:l(d),payload:{height:Je(t)}}),onFileOpen:t=>(ce.add(t),Ue||(Ue=!0,r.addEventListener("keydown",kt,!0)),te&&t(te),()=>{ce.delete(t)}),onFileSnapshot:t=>(ee=t,()=>{ee===t&&(ee=null)}),onFileSaved:t=>(de.add(t),()=>{de.delete(t)}),reportFileChange:t=>Ie({...x,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:bt,reportFileUnsupported:()=>Ie({...x,type:"file-unsupported"}),dispose:()=>{for(let t of z.keys())U({...x,type:"workspace-unsubscribe",id:l(d),payload:{subscriptionId:t}});z.clear();for(let t of j.keys())U({...x,type:"shells-unsubscribe",id:l(d),payload:{subscriptionId:t}});j.clear(),L=!0,Z=null,q=null,ee=null,ce.clear(),de.clear(),Ue&&r.removeEventListener("keydown",kt,!0),r.removeEventListener("message",At),r.removeEventListener("keydown",gt,!0),r.removeEventListener("pointerover",pe),r.removeEventListener("pointermove",pe),r.removeEventListener("pointerout",yt),r.removeEventListener("focus",Ot),r.removeEventListener("blur",vt);for(let t of V.values())clearTimeout(t.timer),t.reject(new a("HOST_UNAVAILABLE","Host client was disposed."));V.clear(),E.clear(),O.clear(),D.clear(),C.clear(),H.clear(),$.clear(),Q.clear(),ie.clear(),ae.clear()}}};var lo=["browser.open","browser.snapshot","browser.click","browser.type","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize"];var sr=new Set(lo);var po=["none","agent","user"];var ar=new Set(po);var wo=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Uo=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],uo=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,m]of wo)r.style.setProperty(s,e.tokens[m]);for(let[s,m,E]of Uo){let O=e.tokens[E]??"";r.style.setProperty(s,O),r.style.setProperty(m,O)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size","0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},ct=(e,r)=>{uo(e.theme,r),r.dataset&&(r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode)};var Io={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},S=(e,r)=>`var(--${e}, var(--oc-${Io[e]}, ${r}))`,X=S("surface-background","transparent"),ge=S("surface-elevated","transparent"),se=S("surface-elevated-foreground","inherit"),F=S("surface-foreground","inherit"),T=S("surface-muted-foreground","gray"),Co=S("surface-muted","transparent"),I=S("interactive-border","currentColor"),w=S("interactive-hover","transparent"),B=S("interactive-active","transparent"),dt=S("interactive-selection","transparent"),lt=S("interactive-selection-foreground","inherit"),_o=S("interactive-focus-ring","currentColor"),N=S("primary","currentColor"),pt=S("primary-text","inherit"),ut=S("error-text","inherit"),Mo=S("font-sans","inherit"),Et=S("font-mono","monospace"),So=S("radius","9px"),ft=`calc(${So} - 2px)`,Eo=`calc(${So} - 4px)`,k=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,fo=`box-shadow: 0 0 0 2px ${_o};`,ye=e=>{let r=S(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${S(`${e}-text`,"inherit")}; }`},Lo=`
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: 6px; height: 28px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: 4px; height: 24px; padding: 0 8px; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 32px; padding: 0 10px; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: 8px 10px; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; width: 100%; min-width: 0; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 28px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: 14px; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; }
`,To=`
.oc-sdk { color: ${F}; font-family: ${Mo}; }
.oc-sdk :focus-visible { outline: none; ${fo} }
.oc-sdk-mono { font-family: ${Et}; }
.oc-sdk-muted { color: ${T}; }
${ye("success")}${ye("warning")}${ye("error")}${ye("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${N}; --oc-sdk-tone-text: ${pt}; }

.oc-sdk-btn { border-radius: ${ft}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Eo}; }
.oc-sdk-btn[data-variant="default"] { color: ${pt}; background: ${k(N,10,X)}; border-color: ${k(N,12)}; }
.oc-sdk-btn[data-variant="default"]:hover { background: ${k(N,16,X)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${k(N,22,X)}; }
.oc-sdk-btn[data-variant="secondary"] { background: ${Co}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${B}, ${B}); }
.oc-sdk-btn[data-variant="outline"] { background: ${ge}; color: ${se}; border-color: ${I}; }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${B}, ${B}); }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${w}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${B}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${S("status-error","red")}; color: ${ut}; background: ${k("var(--oc-sdk-tone)",7,X)}; border-color: ${k("var(--oc-sdk-tone)",12)}; }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${k("var(--oc-sdk-tone)",9,X)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${k("var(--oc-sdk-tone)",11,X)}; }

.oc-sdk-field-note { color: ${T}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${ut}; }
.oc-sdk-input { border-radius: ${ft}; background: ${ge}; color: ${se}; box-shadow: inset 0 0 0 1px ${k(I,60)}; transition: background 150ms ease-out, box-shadow 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${T}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { box-shadow: inset 0 0 0 2px ${_o}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input { box-shadow: inset 0 0 0 1px ${S("status-error","red")}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { box-shadow: inset 0 0 0 2px ${S("status-error","red")}; }
.oc-sdk-input[data-mono="true"] { font-family: ${Et}; }

.oc-sdk-search-icon { color: ${T}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${N}; }
.oc-sdk-search-clear { border-radius: ${Eo}; color: ${T}; }
.oc-sdk-search-clear:hover { background: ${w}; color: ${F}; }

.oc-sdk-trigger { border-color: ${I}; border-radius: ${ft}; background: ${ge}; color: ${se}; transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${B}, ${B}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${T}; }
.oc-sdk-trigger-chevron { color: ${T}; }
.oc-sdk-popup { --surface-foreground: ${se}; border-color: ${k(I,60)}; border-radius: 12px; background: ${ge}; color: ${se}; box-shadow: 0 8px 24px ${k(F,12)}; }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${w}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${dt}; color: ${lt}; }
.oc-sdk-option-check { color: ${F}; }
.oc-sdk-option[data-destructive="true"] { color: ${ut}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${k(S("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${T}; }
.oc-sdk-popup-empty { color: ${T}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${I}; border-radius: 4px; color: ${F}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${k(F,60,I)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${I}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${X}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${N}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${fo} }
.oc-sdk-check-desc { color: ${T}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${k(F,4)}; }
.oc-sdk-tab { border-radius: 8px; color: ${T}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${F}; }
.oc-sdk-tab[aria-selected="true"] { color: ${lt}; background: ${dt}; border-color: ${I}; }
.oc-sdk-tab-count { color: ${T}; }

.oc-sdk-badge { border-radius: 9999px; background: ${w}; color: ${T}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${k("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${w}; }
.oc-sdk-row[aria-selected="true"] { background: ${dt}; color: ${lt}; }
.oc-sdk-row-lead { font-family: ${Et}; color: ${T}; }
.oc-sdk-row-sub { color: ${T}; }
.oc-sdk-row-meta { color: ${T}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${T}; }

.oc-sdk-empty-body { color: ${T}; }

.oc-sdk-spinner { color: ${T}; }
.oc-sdk-spinner-ring { border-color: ${I}; border-top-color: ${N}; border-radius: 9999px; }

.oc-sdk-banner { border-color: ${k("var(--oc-sdk-tone)",40)}; border-radius: 8px; background: ${k("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${T}; }

.oc-sdk-separator { color: ${T}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${k(I,40)}; }

.oc-sdk-progress-label { color: ${T}; }
.oc-sdk-progress-track { border-radius: 9999px; background: ${I}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${N}); }

.oc-sdk-text a { color: ${pt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${k(I,60)}; }
`,y=`
${Le}
${Lo}
${To}`;var Tt=at(),mo=document.getElementById("root"),ho=e=>{if(!e)return"\u5C1A\u672A\u540C\u6B65";let r=new Date(e),s=m=>String(m).padStart(2,"0");return`${s(r.getMonth()+1)}-${s(r.getDate())} ${s(r.getHours())}:${s(r.getMinutes())}`};async function mt(){try{let e=await Tt.serviceRequest({method:"GET",path:"/state"}),r=JSON.parse(e.body||"{}"),s=r.busy?"warn":r.lastError?"bad":r.locked?"warn":"ok",m=r.busy?"\u540C\u6B65\u4E2D":r.locked?r.configured?"\u5DF2\u9501\u5B9A":"\u672A\u914D\u7F6E":r.lastError?"\u9700\u8981\u5904\u7406":"\u5DF2\u5C31\u7EEA";mo.innerHTML=`
      <div class="line"><span class="dot ${s}"></span><strong>${m}</strong><span class="muted">\u4E91\u7AEF ${ho(r.remoteUpdatedAt)}</span></div>
      <div class="line muted">\u672C\u673A ${ho(r.lastSyncAt)}${r.pendingDeletions?.length?` \xB7 \u5F85\u786E\u8BA4\u5220\u9664 ${r.pendingDeletions.length}`:""}</div>
      ${r.lastError?`<div class="line bad">${String(r.lastError).slice(0,120)}</div>`:""}`,Tt.setHeight?.(document.documentElement.scrollHeight)}catch{mo.innerHTML='<div class="line bad">\u540C\u6B65\u670D\u52A1\u4E0D\u53EF\u7528</div>'}}Tt.onReady(e=>{ct(e,document.documentElement),mt()});setInterval(mt,15e3);mt();})();
