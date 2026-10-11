import{V as g,_ as S,$ as z,a0 as T,a1 as I,b as F,B as D,a2 as L,r as i,a3 as R,a4 as B,e as O,a5 as k,a as A,u as V,a6 as N,a7 as U}from"./index-BcZHwAEf.js";var $=Object.defineProperty,G=(e,t,n)=>t in e?$(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n,b=(e,t,n)=>(G(e,typeof t!="symbol"?t+"":t,n),n);const W=(()=>{const e={uniforms:{turbidity:{value:2},rayleigh:{value:1},mieCoefficient:{value:.005},mieDirectionalG:{value:.8},sunPosition:{value:new g},up:{value:new g(0,1,0)}},vertexShader:`
      uniform vec3 sunPosition;
      uniform float rayleigh;
      uniform float turbidity;
      uniform float mieCoefficient;
      uniform vec3 up;

      varying vec3 vWorldPosition;
      varying vec3 vSunDirection;
      varying float vSunfade;
      varying vec3 vBetaR;
      varying vec3 vBetaM;
      varying float vSunE;

      // constants for atmospheric scattering
      const float e = 2.71828182845904523536028747135266249775724709369995957;
      const float pi = 3.141592653589793238462643383279502884197169;

      // wavelength of used primaries, according to preetham
      const vec3 lambda = vec3( 680E-9, 550E-9, 450E-9 );
      // this pre-calcuation replaces older TotalRayleigh(vec3 lambda) function:
      // (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
      const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );

      // mie stuff
      // K coefficient for the primaries
      const float v = 4.0;
      const vec3 K = vec3( 0.686, 0.678, 0.666 );
      // MieConst = pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K
      const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

      // earth shadow hack
      // cutoffAngle = pi / 1.95;
      const float cutoffAngle = 1.6110731556870734;
      const float steepness = 1.5;
      const float EE = 1000.0;

      float sunIntensity( float zenithAngleCos ) {
        zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
        return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
      }

      vec3 totalMie( float T ) {
        float c = ( 0.2 * T ) * 10E-18;
        return 0.434 * c * MieConst;
      }

      void main() {

        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        vWorldPosition = worldPosition.xyz;

        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_Position.z = gl_Position.w; // set z to camera.far

        vSunDirection = normalize( sunPosition );

        vSunE = sunIntensity( dot( vSunDirection, up ) );

        vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

        float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );

      // extinction (absorbtion + out scattering)
      // rayleigh coefficients
        vBetaR = totalRayleigh * rayleighCoefficient;

      // mie coefficients
        vBetaM = totalMie( turbidity ) * mieCoefficient;

      }
    `,fragmentShader:`
      varying vec3 vWorldPosition;
      varying vec3 vSunDirection;
      varying float vSunfade;
      varying vec3 vBetaR;
      varying vec3 vBetaM;
      varying float vSunE;

      uniform float mieDirectionalG;
      uniform vec3 up;

      const vec3 cameraPos = vec3( 0.0, 0.0, 0.0 );

      // constants for atmospheric scattering
      const float pi = 3.141592653589793238462643383279502884197169;

      const float n = 1.0003; // refractive index of air
      const float N = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

      // optical length at zenith for molecules
      const float rayleighZenithLength = 8.4E3;
      const float mieZenithLength = 1.25E3;
      // 66 arc seconds -> degrees, and the cosine of that
      const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;

      // 3.0 / ( 16.0 * pi )
      const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
      // 1.0 / ( 4.0 * pi )
      const float ONE_OVER_FOURPI = 0.07957747154594767;

      float rayleighPhase( float cosTheta ) {
        return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
      }

      float hgPhase( float cosTheta, float g ) {
        float g2 = pow( g, 2.0 );
        float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
        return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
      }

      void main() {

        vec3 direction = normalize( vWorldPosition - cameraPos );

      // optical length
      // cutoff angle at 90 to avoid singularity in next formula.
        float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
        float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
        float sR = rayleighZenithLength * inverse;
        float sM = mieZenithLength * inverse;

      // combined extinction factor
        vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

      // in scattering
        float cosTheta = dot( direction, vSunDirection );

        float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
        vec3 betaRTheta = vBetaR * rPhase;

        float mPhase = hgPhase( cosTheta, mieDirectionalG );
        vec3 betaMTheta = vBetaM * mPhase;

        vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
        Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

      // nightsky
        float theta = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
        float phi = atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
        vec2 uv = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
        vec3 L0 = vec3( 0.1 ) * Fex;

      // composition + solar disc
        float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
        L0 += ( vSunE * 19000.0 * Fex ) * sundisk;

        vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

        vec3 retColor = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );

        gl_FragColor = vec4( retColor, 1.0 );

      #include <tonemapping_fragment>
      #include <${I>=154?"colorspace_fragment":"encodings_fragment"}>

      }
    `},t=new S({name:"SkyShader",fragmentShader:e.fragmentShader,vertexShader:e.vertexShader,uniforms:T.clone(e.uniforms),side:z,depthWrite:!1});class n extends F{constructor(){super(new D(1,1,1),t)}}return b(n,"SkyShader",e),b(n,"material",t),n})(),X=()=>parseInt(L.replace(/\D+/g,"")),j=X();function K(e,t,n=new g){const o=Math.PI*(e-.5),l=2*Math.PI*(t-.5);return n.x=Math.cos(l),n.y=Math.sin(o),n.z=Math.sin(l),n}const q=i.forwardRef(({inclination:e=.6,azimuth:t=.1,distance:n=1e3,mieCoefficient:o=.005,mieDirectionalG:l=.8,rayleigh:d=.5,turbidity:r=10,sunPosition:f=K(e,t),...c},u)=>{const s=i.useMemo(()=>new g().setScalar(n),[n]),[y]=i.useState(()=>new W);return i.createElement("primitive",R({object:y,ref:u,"material-uniforms-mieCoefficient-value":o,"material-uniforms-mieDirectionalG-value":l,"material-uniforms-rayleigh-value":d,"material-uniforms-sunPosition-value":f,"material-uniforms-turbidity-value":r,scale:s},c))});class Y extends S{constructor(){super({uniforms:{time:{value:0},pixelRatio:{value:1}},vertexShader:`
        uniform float pixelRatio;
        uniform float time;
        attribute float size;  
        attribute float speed;  
        attribute float opacity;
        attribute vec3 noise;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vOpacity;

        void main() {
          vec4 modelPosition = modelMatrix * vec4(position, 1.0);
          modelPosition.y += sin(time * speed + modelPosition.x * noise.x * 100.0) * 0.2;
          modelPosition.z += cos(time * speed + modelPosition.x * noise.y * 100.0) * 0.2;
          modelPosition.x += cos(time * speed + modelPosition.x * noise.z * 100.0) * 0.2;
          vec4 viewPosition = viewMatrix * modelPosition;
          vec4 projectionPostion = projectionMatrix * viewPosition;
          gl_Position = projectionPostion;
          gl_PointSize = size * 25. * pixelRatio;
          gl_PointSize *= (1.0 / - viewPosition.z);
          vColor = color;
          vOpacity = opacity;
        }
      `,fragmentShader:`
        varying vec3 vColor;
        varying float vOpacity;
        void main() {
          float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
          float strength = 0.05 / distanceToCenter - 0.1;
          gl_FragColor = vec4(vColor, strength * vOpacity);
          #include <tonemapping_fragment>
          #include <${j>=154?"colorspace_fragment":"encodings_fragment"}>
        }
      `})}get time(){return this.uniforms.time.value}set time(t){this.uniforms.time.value=t}get pixelRatio(){return this.uniforms.pixelRatio.value}set pixelRatio(t){this.uniforms.pixelRatio.value=t}}const M=e=>e&&e.constructor===Float32Array,Z=e=>[e.r,e.g,e.b],C=e=>e instanceof N||e instanceof g||e instanceof U,_=e=>Array.isArray(e)?e:C(e)?e.toArray():[e,e,e];function h(e,t,n){return i.useMemo(()=>{if(t!==void 0){if(M(t))return t;if(t instanceof A){const o=Array.from({length:e*3},()=>Z(t)).flat();return Float32Array.from(o)}else if(C(t)||Array.isArray(t)){const o=Array.from({length:e*3},()=>_(t)).flat();return Float32Array.from(o)}return Float32Array.from({length:e},()=>t)}return Float32Array.from({length:e},n)},[t])}const J=i.forwardRef(({noise:e=1,count:t=100,speed:n=1,opacity:o=1,scale:l=1,size:d,color:r,children:f,...c},u)=>{i.useMemo(()=>B({SparklesImplMaterial:Y}),[]);const s=i.useRef(null),y=O(P=>P.viewport.dpr),m=_(l),v=i.useMemo(()=>Float32Array.from(Array.from({length:t},()=>m.map(k.randFloatSpread)).flat()),[t,...m]),w=h(t,d,Math.random),p=h(t,o),a=h(t,n),x=h(t*3,e),E=h(r===void 0?t*3:t,M(r)?r:new A(r),()=>1);return V(P=>{s.current&&s.current.material&&(s.current.material.time=P.clock.elapsedTime)}),i.useImperativeHandle(u,()=>s.current,[]),i.createElement("points",R({key:`particle-${t}-${JSON.stringify(l)}`},c,{ref:s}),i.createElement("bufferGeometry",null,i.createElement("bufferAttribute",{attach:"attributes-position",args:[v,3]}),i.createElement("bufferAttribute",{attach:"attributes-size",args:[w,1]}),i.createElement("bufferAttribute",{attach:"attributes-opacity",args:[p,1]}),i.createElement("bufferAttribute",{attach:"attributes-speed",args:[a,1]}),i.createElement("bufferAttribute",{attach:"attributes-color",args:[E,3]}),i.createElement("bufferAttribute",{attach:"attributes-noise",args:[x,3]})),f||i.createElement("sparklesImplMaterial",{transparent:!0,pixelRatio:y,depthWrite:!1}))});function Q(e=!1,t={}){const{yawSensitivity:n=.0055,pitchSensitivity:o=.012,minPitch:l=-1.8,maxPitch:d=3.5}=t,r=i.useRef(0),f=i.useRef(0),c=i.useRef(!1),u=i.useRef({x:0,y:0}),s=i.useRef(null);return i.useEffect(()=>{if(typeof window>"u")return;const m=a=>a?!!(a.closest("button")||a.closest("input")||a.closest("a")||a.closest('[data-ui="true"]')||a.closest(".pointer-events-auto")):!1,v=a=>{s.current===null&&(m(a.target)||(s.current=a.pointerId,c.current=!0,u.current={x:a.clientX,y:a.clientY}))},w=a=>{if(!c.current||a.pointerId!==s.current)return;const x=a.clientX-u.current.x,E=a.clientY-u.current.y;u.current={x:a.clientX,y:a.clientY},r.current-=x*n,f.current=Math.max(l,Math.min(d,f.current+E*o))},p=a=>{a.pointerId===s.current&&(c.current=!1,s.current=null)};return window.addEventListener("pointerdown",v,!1),window.addEventListener("pointermove",w,!1),window.addEventListener("pointerup",p,!1),window.addEventListener("pointercancel",p,!1),()=>{window.removeEventListener("pointerdown",v),window.removeEventListener("pointermove",w),window.removeEventListener("pointerup",p),window.removeEventListener("pointercancel",p)}},[n,o,l,d]),i.useEffect(()=>{if(!e||c.current)return;let m;const v=()=>{!c.current&&Math.abs(r.current)>.001?(r.current*=.94,m=requestAnimationFrame(v)):c.current||(r.current=0)};return m=requestAnimationFrame(v),()=>cancelAnimationFrame(m)},[e]),{yawOffsetRef:r,pitchOffsetRef:f,isDraggingRef:c,resetDrag:()=>{r.current=0,f.current=0,c.current=!1}}}export{q as S,J as a,Q as u};
