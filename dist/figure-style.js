/* Colors from the LaTeX figure sources. Group identities come from saved data. */
(() => {
  'use strict';
  const palette=[[35,59,145],[165,211,242],[190,96,137],[72,151,80],[98,137,173],[194,194,194]];
  const mix=(rgb,amount)=>'#'+rgb.map(c=>Math.round(255+(c-255)*amount).toString(16).padStart(2,'0')).join('');
  const cache=new WeakMap();
  function groupColors(labels,grid=16) {
    if(cache.has(labels))return cache.get(labels);
    const groups=[...new Set(labels)],adjacent=new Map(groups.map(g=>[g,new Set()])),areas=new Map(groups.map(g=>[g,0]));
    labels.forEach((g,p)=>{
      areas.set(g,areas.get(g)+1);
      const row=Math.floor(p/grid),col=p%grid;
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++) {
        const r=row+dr,c=col+dc;
        if(r<0||r>=grid||c<0||c>=grid)continue;
        const other=labels[r*grid+c];if(other!==g)adjacent.get(g).add(other);
      }
    });
    const assigned=new Map(),coverage=palette.map(()=>0),fills=palette.map(rgb=>mix(rgb,.82));
    while(assigned.size<groups.length) {
      const saturation=g=>new Set([...adjacent.get(g)].filter(n=>assigned.has(n)).map(n=>assigned.get(n))).size;
      const g=groups.filter(n=>!assigned.has(n)).sort((a,b)=>saturation(b)-saturation(a)||adjacent.get(b).size-adjacent.get(a).size||areas.get(b)-areas.get(a)||a-b)[0];
      const used=new Set([...adjacent.get(g)].filter(n=>assigned.has(n)).map(n=>assigned.get(n)));
      let choices=fills.map((_,i)=>i).filter(i=>!used.has(i));
      if(!choices.length) {
        // Extra shades retain the same AF3 hues for unusually dense group graphs.
        const i=fills.length;
        fills.push(mix(palette[i%palette.length],Math.max(.18,.62-.16*Math.floor((i-palette.length)/palette.length))));
        coverage.push(0);choices=[i];
      }
      const color=choices.sort((a,b)=>coverage[a]-coverage[b]||a-b)[0];
      assigned.set(g,color);coverage[color]+=areas.get(g);
    }
    const colors=new Map(groups.map(g=>[g,fills[assigned.get(g)]]));
    cache.set(labels,colors);return colors;
  }
  window.HiTFigureStyle=Object.freeze({groupColors});
})();
