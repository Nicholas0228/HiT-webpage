/* Particle targets come only from the user's selected snap GIF.
 * No hand geometry, bones, or generated poses are used.
 * Every source frame contains the same 7,200 point identities.
 */
(() => {
  'use strict';
  async function load() {
    const [infoResponse,dataResponse,toneResponse,detailResponse]=await Promise.all([
      fetch('assets/snap-particles.json?v=3a7fb3311c9f'),
      fetch('assets/snap-particles.bin?v=3a7fb3311c9f'),
      fetch('assets/snap-tones.bin?v=3a7fb3311c9f'),
      fetch('assets/snap-details.bin?v=3a7fb3311c9f')
    ]);
    if(!infoResponse.ok || !dataResponse.ok || !toneResponse.ok || !detailResponse.ok) throw new Error('Cannot load the source snap frames.');
    const info=await infoResponse.json();
    if(info.count!==7200) throw new Error('The snap source must contain 7,200 particles per frame.');
    const regions=info.regionCounts;
    if(!regions || regions.face+regions.hand+regions.body!==info.count) throw new Error('Source particle regions are incomplete.');
    const snapIndex=info.frames.findIndex(frame=>frame.clipTimeMs>=info.snapMs);
    const snapStartMs=info.snapStartMs ?? info.frames[Math.max(0,snapIndex-1)].clipTimeMs;
    const data=new Uint16Array(await dataResponse.arrayBuffer());
    const tones=new Uint8Array(await toneResponse.arrayBuffer());
    const details=new Uint8Array(await detailResponse.arrayBuffer());
    if(details.length!==info.frames.length*info.count) throw new Error('Source finger detail data is incomplete.');
    if(tones.length!==info.frames.length*info.count) throw new Error('Source snap tone data is incomplete.');
    if(data.length!==info.frames.length*info.count*2) throw new Error('Source snap frame data is incomplete.');
    const detailStrengths=Float32Array.from(details,value=>{
      const t=Math.max(0,Math.min(1,(value/255-.20)/.52));
      return t*t*(3-2*t);
    });
    return {
      count:info.count,durationMs:info.durationMs,snapMs:info.snapMs,snapStartMs,
      width:info.width,height:info.height,
      firstTimeMs:info.frames[0].clipTimeMs,lastTimeMs:info.frames[info.frames.length-1].clipTimeMs,
      radiusScale(index) {
        return index>=regions.face && index<regions.face+regions.hand ? 1 : 1.4;
      },
      frameAt(ms) {
        let a=0;
        while(a<info.frames.length-1 && info.frames[a+1].clipTimeMs<=ms) a++;
        const b=Math.min(a+1,info.frames.length-1);
        const start=info.frames[a].clipTimeMs;
        const duration=b===a?1:info.frames[b].clipTimeMs-start;
        return {a,b,t:Math.max(0,Math.min(1,(ms-start)/duration))};
      },
      fillFrame(frame,xy,toneValues,detailValues) {
        const begin=frame.a*info.count,end=frame.b*info.count,t=frame.t;
        for(let i=0;i<info.count;i++) {
          const a=begin+i,b=end+i,j=i*2;
          xy[j]=(data[a*2]+(data[b*2]-data[a*2])*t)/16-info.width/2;
          xy[j+1]=(data[a*2+1]+(data[b*2+1]-data[a*2+1])*t)/16-info.height/2;
          toneValues[i]=(tones[a]+(tones[b]-tones[a])*t)/255;
          const first=detailStrengths[a],last=detailStrengths[b];
          detailValues[i]=first+(last-first)*t;
        }
      },
      position(index,frame) {
        const a=(frame.a*info.count+index)*2,b=(frame.b*info.count+index)*2;
        return {
          x:(data[a]+(data[b]-data[a])*frame.t)/16-info.width/2,
          y:(data[a+1]+(data[b+1]-data[a+1])*frame.t)/16-info.height/2
        };
      }
    };
  }
  window.HiTSnap={load};
})();
