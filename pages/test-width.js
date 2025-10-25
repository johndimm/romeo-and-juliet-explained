export default function TestWidth() {
  return (
    <div style={{fontFamily:'system-ui, -apple-system, Segoe UI, Roboto', lineHeight:1.4}}>
      <h1 style={{margin:'8px'}}>Width Debug</h1>
      <p style={{margin:'8px'}}>Each band should touch the left and right edges exactly.</p>
      <Band label="100% of body" color="#e3f2fd" style={{ width: '100%' }} />
      <Band label="100vw" color="#c8e6c9" style={{ width: '100vw' }} />
      <Band label="#__next (100%)" color="#ffe0b2" style={{ width: '100%', maxWidth:'100%' }} />
      <Band label="Container (100%)" color="#ffcdd2" style={{ width: '100%', maxWidth:'100%' }} />
      <div style={{padding:'8px'}}>
        <div>Viewport width JS: <code id="vw"/></div>
        <div>DocumentElement.clientWidth: <code id="cw"/></div>
      </div>
      <script dangerouslySetInnerHTML={{__html:`
        const vw = Math.round(window.innerWidth);
        const cw = Math.round(document.documentElement.clientWidth);
        document.getElementById('vw').textContent = vw + 'px';
        document.getElementById('cw').textContent = cw + 'px';
      `}} />
    </div>
  );
}

function Band({label, color, style}){
  return (
    <div style={{ background: color, ...style }}>
      <div style={{ padding:'8px', border:'1px dashed #888', boxSizing:'border-box' }}>{label}</div>
    </div>
  );
}

