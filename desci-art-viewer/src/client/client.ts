import { timeStamp } from 'console';
import * as THREE from 'three'
import { Texture, ObjectLoader, Mesh, BufferGeometry } from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'

const proj = require('./projected/ProjectedMaterial.js')
const ProjectedMaterial = proj.default;
const RENDER_TEXTURE_ONLY = false;

const scene = new THREE.Scene()
const bufferScene = new THREE.Scene();

const bufferTexture = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter });

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.z = 30

const { noise } = require('./perlin.js');

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setClearColor('black');

renderer.setSize(window.innerWidth, window.innerHeight)
const img = document.createElement("img");
img.src = "./desci-logo.png";
img.style.position = "fixed";
img.style.bottom = "0"
img.style.right = "0"
img.style.width = "100px"
img.style.height = "100px"
img.style.zIndex = "9"
img.style.background = "white"
img.style.filter = "invert(1)";

document.body.appendChild(renderer.domElement);
document.body.appendChild(img);

const controls = new OrbitControls(camera, renderer.domElement)

// const geometry = new THREE.BoxGeometry()
// const material = new THREE.MeshBasicMaterial({
//     color: 0x00ff00,
//     wireframe: false,
// })

// game

var geometry = new THREE.BufferGeometry();


// geometry.addAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
// geometry.addAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

var blueMaterial = new THREE.MeshBasicMaterial({ color: 0x7074FF })
var plane = new THREE.PlaneBufferGeometry(window.innerWidth, window.innerHeight);
var planeObject = new THREE.Mesh(plane, blueMaterial);
planeObject.position.z = -600;
bufferScene.add(planeObject);


function vertexShader() {
    return `
      varying vec3 vUv; 
  
      void main() {
        vUv = position; 
  
        vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewPosition; 
      }
    `
}

function fragmentShader() {
    return `
    uniform vec3 colorA; 
    uniform vec3 colorB; 
    varying vec3 vUv;

    void main() {
      gl_FragColor = vec4(vUv.x, vUv.y, vUv.z, 1.0);
    }
`
}

// var material = new THREE.PointsMaterial({ size: 15, sizeAttenuation: false, vertexColors: true });
// var points = new THREE.Points(geometry, material);
// var mycolors = points.geometry.attributes.color.array;

// bufferScene.add(points);


class GameState {
    positions: Array<number> = [];
    colors: Array<number> = [];
    colorWhite = new THREE.Color('#5b0a91');
    colorDark = new THREE.Color('#111');
    xcells = 0;
    ycells = 0;
    particles = 0;
    cells: any[] = [];
    newcells: any[] = [];
    mycolors: ArrayLike<number> = [];
    geometry: THREE.BufferGeometry;
    clonedGeometry: THREE.BufferGeometry;
    count: number;
    simpleCount: number = 0;
    radius: number = 4;
    radialSegments: number;
    tubularSegments: number;
    wiremesh: any;
    mesh: any;
    group?: THREE.Group;
    constructor(geometry: THREE.BufferGeometry, radius: number, radialSegments: number, tubularSegments: number) {

        this.geometry = geometry.toNonIndexed();
        this.count = this.geometry.attributes.position.count;
        this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
        this.radialSegments = radialSegments;
        this.tubularSegments = tubularSegments;
        this.clonedGeometry = this.geometry.clone();
        if (radius) {
            console.log("RAIDUS", radius);
            this.radius = radius;
        }

        this.processMesh();
        this.initialize();
    }

    setColor = (index: number, color: THREE.Color) => {
        const colors3 = this.clonedGeometry.attributes.color;

        if (index < 0) {
            // console.log("OLD INDEX", index, this.count, this.count / 6);
            index = (this.count / 6) + index;
            // console.log("NEW INDEX", index);
        }

        if (index >= this.count / 6) {
            index = index - this.count / 6
        }

        for (let i = index * 6; i < (index + 1) * 6; i++) {

            colors3.setXYZ(i, color.r, color.g, color.b);

        }
    }

    getColor = (index: number): THREE.Color => {
        const colors3 = this.clonedGeometry.attributes.color;

        if (index < 0) {
            // console.log("OLD INDEX", index, this.count, this.count / 6);
            index = (this.count / 6) + index;
            // console.log("NEW INDEX", index);
        }
        if (index >= this.count / 6) {
            // debugger
            index = index - this.count / 6
        }

        return new THREE.Color(colors3.getX(index * 6), colors3.getY(index * 6), colors3.getZ(index * 6))
    }

    processMesh = () => {
        const geometry1 = this.geometry;

        // this.clonedGeometry = geometry1.clone();
        const color = new THREE.Color();
        const positions3 = this.clonedGeometry.attributes.position;
        const colors3 = this.clonedGeometry.attributes.color;
        const radius = 10;

        this.xcells = this.count / 6;
        this.ycells = this.count / 6 / this.radius;

        // console.log("COUHT", this.count);
        // for (let i = 0; i < 6; i++) {

        //     color.setRGB(1, (positions3.getY(i) / radius + 1) / 2, 0);
        //     colors3.setXYZ(i, color.r, color.g, color.b);

        // }
        this.setColor(0, new THREE.Color("red"));

        let uniforms = {
            colorB: { type: 'vec3', value: new THREE.Color(0xACB6E5) },
            // colorA: {type: 'vec3', value: new THREE.Color(0x74ebd5)}
        }
        // let material = new THREE.ShaderMaterial({
        //     uniforms: uniforms,
        //     fragmentShader: fragmentShader(),
        //     vertexShader: vertexShader(),
        //     vertexColors: true,
        //     colorWrite: true,
        //     wireframe: true

        // })

        const material2 = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            // flatShading: true,
            vertexColors: true,
            reflectivity: 1,
            // emissive: 0x111,
            // shininess: 0
        });

        var customVertexShader = `
        #define PHONG

        uniform float time;
      attribute float offset;
        varying vec3 vViewPosition;
        
        #ifndef FLAT_SHADED
        
            varying vec3 vNormal;
        
        #endif
        
        #include <common>
        #include <uv_pars_vertex>
        #include <uv2_pars_vertex>
        #include <displacementmap_pars_vertex>
        #include <envmap_pars_vertex>
        #include <color_pars_vertex>
        #include <fog_pars_vertex>
        #include <morphtarget_pars_vertex>
        #include <skinning_pars_vertex>
        #include <shadowmap_pars_vertex>
        #include <logdepthbuf_pars_vertex>
        #include <clipping_planes_pars_vertex>
        
        void main() {
        
            #include <uv_vertex>
            #include <uv2_vertex>
            #include <color_vertex>
        
            #include <beginnormal_vertex>
            #include <morphnormal_vertex>
            #include <skinbase_vertex>
            #include <skinnormal_vertex>
            #include <defaultnormal_vertex>
        
        #ifndef FLAT_SHADED // Normal computed with derivatives when FLAT_SHADED
        
            vNormal = normalize( transformedNormal );
        
        #endif


      
        
            #include <begin_vertex>
            #include <morphtarget_vertex>
            #include <skinning_vertex>
            #include <displacementmap_vertex>
            #include <project_vertex>
            
            float warp =  (time / 10000.0 );
        gl_Position.x *= abs(cos(warp + offset));
        gl_Position.y *= abs(cos(warp + offset));
        gl_Position.z *= abs(cos(warp + offset));

            #include <logdepthbuf_vertex>
            #include <clipping_planes_vertex>
        
            vViewPosition = - mvPosition.xyz;
        
            #include <worldpos_vertex>
            #include <envmap_vertex>
            #include <shadowmap_vertex>
            #include <fog_vertex>
        
        }
  
          `
        var customUniforms = THREE.UniformsUtils.merge([
            THREE.ShaderLib.phong.uniforms,
            { diffuse: { value: new THREE.Color(0xffffff) } },
            { time: { value: 0.0 } }
        ]);
        var customMaterial = new THREE.ShaderMaterial({
            uniforms: customUniforms,
            vertexShader: customVertexShader,
            fragmentShader: THREE.ShaderLib.phong.fragmentShader,
            lights: true,
            vertexColors: true,
            name: 'custom-material'
        });

        const vertexShader = `
        varying vec2 vUv;
        void main()	{
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `;
      const fragmentShader = `//#extension GL_OES_standard_derivatives : enable
        
        varying vec2 vUv;
        uniform float thickness;
           
        float edgeFactor(vec2 p){
            vec2 grid = abs(fract(p - 0.1) - 0.1) / fwidth(p) / thickness;
              return min(grid.x, grid.y);
        }
        
        void main() {
                
          float a = edgeFactor(vUv);
          
          vec3 c = mix(vec3(1), vec3(0.5), a);
          
          gl_FragColor = vec4(c, 1.0);
        }
      `;
        var customMaterial2 = new THREE.ShaderMaterial({
            // uniforms: customUniforms,
            vertexShader,
            fragmentShader,
            uniforms: {
                thickness: {
                    value: 2
                }
              },
            // lights: true,
            // vertexColors: true,
            name: 'custom-material'
        });



        const wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0x0000BB, wireframe: true, wireframeLinewidth: 1, opacity: 0.9, transparent: true, vertexColors: true });

        let mesh2 = new THREE.Mesh(geometry1, material2);

        let wireframe = new THREE.Mesh(geometry1, customMaterial2);

        mesh2 = new THREE.Mesh(this.clonedGeometry, material2);
        // const quads = this.clonedGeometry.clone().toNonIndexed()
        // const colors = quads.attributes.color;
        // const quads2 = new THREE.BufferGeometry();
        // for (let i = 0; i < this.count; i ++) {
        //     if (i % 6  < 3|| i % 6 < 4) {
        //         quads2.
        //     }
        // }
        // quads.attributes.color.needsUpdate = true;
        wireframe = new THREE.Mesh(geometry1, customMaterial2);
        this.wiremesh = wireframe;
        
        const group = new THREE.Group()
        group.add(mesh2);
        // scene.add(mesh2);
        // group.add(wireframe);

        // const edges = new THREE.EdgesGeometry(this.clonedGeometry, 1)
        // const line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color: 0x0000bb } ) );
        // scene.add(line);
        // group.add(line);
        scene.add(group);

        this.group = group;
        this.mesh = mesh2;

        this.particles = this.xcells * this.ycells;
        this.xcells = this.xcells;
        this.ycells = this.ycells;
    }

    initialize = () => {
        let myrow = [];
        noise.seed(1);
        for (var i = 0; i < this.count / 6; i++) {

            var value = noise.perlin3(i / 100, (i % this.tubularSegments) / 40, i / 2);

            value < 0.05 ? this.setAlive(i) : this.setDead(i);
            // console.log(value);

        }
        this.clonedGeometry.attributes.color.needsUpdate = true;
        // var newcells: any[] = [];
        // for (x = 0; x < this.xcells; x++) {
        //     myrow = [];
        //     for (y = 0; y < this.ycells; y++)
        //         myrow.push(0)
        //     newcells.push(myrow);
        // }

        // for (y = 0; y < this.ycells; y++) {
        //     for (x = 0; x < this.xcells; x++) {
        //         this.positions.push(x, y, 0);
        //         this.colors.push(this.colorDark.r, this.colorDark.g, this.colorDark.b);
        //     }
        // }

        this.mycolors = this.geometry.attributes.color.array;
    }

    countLivingNeighbours = (index: number) => {
        const mod = 0//this.tubularSegments % (index * 6) * -1;


        // bottom-left neigbor
        const bottomBase = index - this.tubularSegments;
        const topBase = index + this.tubularSegments;
        const neighbors = [this.getColor(bottomBase + 1 + mod),
        // bottom neighbor
        this.getColor(bottomBase + mod),
        // bottom-right neighbor
        this.getColor(bottomBase - 1 + mod),

        // left neighbor
        this.getColor(index + 1 + mod),
        // point
        // this.getColor(index + mod),
        // right neighbor
        this.getColor(index - 1 + mod),

        // top-left neighbor

        this.getColor(topBase + 1 + mod),
        // top neighbor
        this.getColor(topBase + mod),
        // top-right neighbor
        this.getColor(topBase - 1 + mod)];

        return neighbors.filter(a => {
            return a.getHexString() == this.colorWhite.getHexString()
        }).length;
    }

    isAlive = (index: number) => {
        const mod = 0//this.tubularSegments % (index * 6) * -1;
        return this.getColor(index + mod).getHexString() == this.colorWhite.getHexString();
    }

    setAlive = (index: number) => {
        const mod = 0// this.tubularSegments % (index * 6) * -1;
        // console.log("SET ALIVE", index);
        return this.setColor(index + mod, this.colorWhite);
    }


    setDead = (index: number) => {
        const mod = 0//this.tubularSegments % (index * 6) * -1;
        // console.log("SET DEAD", index);
        return this.setColor(index + mod, this.colorDark);
    }



    animateSimple = () => {
        this.simpleCount++;
        if (this.simpleCount < this.count / 6 && (this.simpleCount % (this.tubularSegments * 4)) == 8) {
            console.log("SIMPLE", this.simpleCount);




            // console.log("mod", mod, "topBase", topBase, "tubularSegments", this.tubularSegments)

            // this.setColor(this.simpleCount + (this.tubularSegments  - 2), new THREE.Color("white"));
            // this.setColor(this.simpleCount + (this.tubularSegments  - 1), new THREE.Color("white"));
            // this.setColor(this.simpleCount + (this.tubularSegments ), new THREE.Color("white"));

            // this.setColor(this.simpleCount - (this.tubularSegments  - 2), new THREE.Color("green"));
            // this.setColor(this.simpleCount - (this.tubularSegments  - 1), new THREE.Color("green"));
            // this.setColor(this.simpleCount - (this.tubularSegments   ), new THREE.Color("green"));

            // this.clonedGeometry.attributes.color.needsUpdate = true;
        }
    }

    loadShape = () => {
        // var context = (document.getElementById('myCanvas')! as HTMLCanvasElement).getContext('2d')!;

        // // Get the CanvasPixelArray from the given coordinates and dimensions.
        // const shape = []
        // var imgd = context.getImageData(x, y, width, height);
        // var pix = imgd.data;

        // // Loop over each pixel and invert the color.
        // for (var i = 0, n = pix.length; i < n; i += 4) {
        //     pix[i] = 255 - pix[i]; // red
        //     pix[i + 1] = 255 - pix[i + 1]; // green
        //     pix[i + 2] = 255 - pix[i + 2]; // blue
        //     // i+3 is alpha (the fourth element)
        // }

    }

    animate = (time: number) => {
        // var living = 0;
        // this.wiremesh.material.uniforms.time.value = time;
        // stats.begin();
        this.simpleCount += 1;
        if (this.simpleCount > 100) {
            this.simpleCount = 0;
        }
        // console.log(this.simpleCount);
        if (this.simpleCount % 1 == 0) {
            // console.log("ANUM", this.simpleCount);
            //if (animatecount==10) t0 = performance.now();


            //Applying GoL rules to all cells in the grid:
            const deadCells = [];
            const aliveCells = [];
            for (let i = 0; i < this.count / 6; i++) {
                const living = this.countLivingNeighbours(i);
                //´
                // console.log("LIVING", i, living);

                //
                // this.newcells[x][y] = 0;

                if (this.isAlive(i)) { //living cell:
                    if (living < 2 || living > 3)
                        // else if (living < 6) this.setAlive(i);
                        deadCells.push(i)
                    // this.setDead(i)
                }
                else //dead cell:
                {
                    if (living == 3)
                        aliveCells.push(i)
                    // this.setAlive(i)

                };
            }

            deadCells.forEach(e => this.setDead(e))
            aliveCells.forEach(e => this.setAlive(e))
            if (aliveCells.length > 500) {
                // console.log(aliveCells.length, deadCells.length, this.simpleCount);
            }
            // console.log(deadCells.length, aliveCells.length);

            this.clonedGeometry.attributes.color.needsUpdate = true;
        }

        // console.log("living", living);

        //Repainting dead and living cells:
        // for (y = 0; y < this.ycells; y++) {
        //     for (x = 0; x < this.xcells; x++) {
        //         if (false) { //Dead cells fading out to black:
        //             if (this.newcells[x][y] == 1) //alive:
        //                 this.colorWhite.toArray(this.mycolors, (y * this.xcells + x) * 3)
        //             else //dead:
        //             {
        //                 this.colorDark.fromArray(this.mycolors, (y * this.xcells + x) * 3);
        //                 if (this.colorDark.r == 1.0) this.colorDark.r = this.colorDark.r * 0.3
        //                 else this.colorDark.r = this.colorDark.r * 0.98;
        //                 //
        //                 this.colorDark.g = this.colorDark.r;
        //                 this.colorDark.b = 0;
        //                 this.colorDark.toArray(this.mycolors, (y * this.xcells + x) * 3);
        //             };
        //             //
        //             this.cells[x][y] = this.newcells[x][y];
        //         }
        //         else if (this.cells[x][y] != this.newcells[x][y]) { //makes the code faster (1.5x)
        //             if (this.newcells[x][y] == 1) //alive:
        //                 this.colorWhite.toArray(this.mycolors, (y * this.xcells + x) * 3)
        //             else //dead:
        //                 this.colorDark.toArray(this.mycolors, (y * this.xcells + x) * 3);
        //             //
        //             this.cells[x][y] = this.newcells[x][y];
        //         };
        //     };
        // };

        this.geometry.attributes.color.needsUpdate = true;
    }

}


//GoL function for counting living neighbours:

var t0;
var animatecount = 0;

//Function for actual display and rendering:
var gameAnimate = function (geometry: BufferGeometry) {

    // requestAnimationFrame(animate);




    // stats.end();
    /*if (animatecount==20)
    {
        var t1 = performance.now();
        console.log("Time for 10 animation circles: " + (t1 - t0) + " ms.")
    };*/

    // controls.update();
    // renderer.render(scene, camera);
};



// main scene

const boxMaterial = new THREE.MeshBasicMaterial({ map: bufferTexture as unknown as Texture });
(bufferTexture as any).isTexture = true;
const loader = new THREE.TextureLoader();
const reg = loader.load('./doge.jpg');
const boxMaterial2 = new THREE.MeshBasicMaterial({ map: reg });
// const material2 = new ProjectedMaterial({
//     camera: bufferCamera, // the camera that acts as a projector
//     texture: bufferTexture.texture, // the texture being projected
//     textureScale: 2, // scale down the texture a bit
//     // textureOffset: new THREE.Vector2(0.1, 0.1), // you can translate the texture if you want
//     cover: true, // enable background-size: cover behaviour, by default it's like background-size: contain
//     color: 'black',
//     // roughness: 0.3, // you can pass any other option that belongs to MeshPhysicalMaterial
// })
var material3 = new THREE.MeshPhongMaterial({ flatShading: true, wireframe: false, color: 'white', vertexColors: true })
const radius = 10;
const radialSegments = 256 * 2;
const tubularSegments = 32 ;

/*     * @param [radius=1]
     * @param [tube=0.4]
     * @param [radialSegments=64]
     * @param [tubularSegments=8]
     * @param [p=2]
     * @param [q=3]*/
const boxGeometry2 = new THREE.TorusKnotGeometry(radius, radius / 4, radialSegments, tubularSegments);
const mainBoxObject = new THREE.Mesh(boxGeometry2, material3);
const geometry1 = mainBoxObject.geometry.toNonIndexed();

const STATE = new GameState(geometry1, radius, radialSegments, tubularSegments);

const doColor = (mesh: Mesh) => {
    // const mesh = object.getObjectByProperty('type', "Mesh") as Mesh;
    // mesh.material = material3;
    // mesh.geometry = mesh.geometry.toNonIndexed();


}

// doColor(mainBoxObject);
// scene.add(mainBoxObject);

// mainBoxObject.material=boxMateria

const loader2 = new OBJLoader();


// material2.project(mainBoxObject)
const ambientLight = new THREE.AmbientLight(0xffffff, 1)
ambientLight.position.set(0, -1000, 0);
scene.add(ambientLight)

const spotLight = new THREE.SpotLight(0xffffff);
spotLight.position.set(0, 1000, 0);
spotLight.intensity = 4;
spotLight.castShadow = true;
scene.add(spotLight);

// animate();
window.addEventListener('resize', onWindowResize, false)
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    render()
}

function vertexOffsets(numberOfOffsets: number) {
    var offsets = new Float32Array(numberOfOffsets);
    for (var i = 0; i < numberOfOffsets; i++) { i % 10 < 5 ? offsets[i] = 1 : offsets[i] = 2; }
    return offsets;
}

let lastTime = 0;
function animate(timestamp: number) {
    requestAnimationFrame(animate)
    STATE.animate(timestamp);

    // gameAnimate();

    // STATE.mesh.rotation.x += 0.001
    // STATE.mesh.rotation.x += 0.0005 * (timestamp - lastTime)
    STATE.group!.rotation.y += 0.0005 * (timestamp - lastTime)
    // STATE.mesh.rotation.z += 0.0005 * (timestamp - lastTime)
    lastTime = timestamp
    // STATE.mesh.material.uniforms.time.value = timestamp;

    var offset = vertexOffsets(STATE.mesh.geometry.attributes.position.count);
    STATE.mesh.geometry.addAttribute('offset', new THREE.BufferAttribute(offset, 1));

    // mesh.geometry.attributes.color.needsUpdate = true;

    // material2.textureOffset = new THREE.Vector2(mainBoxObject.rotation.x, mainBoxObject.rotation.y)
    // material2.project(mainBoxObject)

    controls.update()

    render()
}

function render() {

    !RENDER_TEXTURE_ONLY && renderer.setRenderTarget(bufferTexture);
    // renderer.render(bufferScene, bufferCamera);

    if (!RENDER_TEXTURE_ONLY) {
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
    }
}
animate(0)
