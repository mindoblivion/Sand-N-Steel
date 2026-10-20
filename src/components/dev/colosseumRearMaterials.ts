import * as THREE from 'three';

/** C-8.69D: used only by the dynamically imported development diagnostic. */
export type RearMode = 'A' | 'B' | 'C';

/** Real outer shell, not the bowl/floor or translated front portal assembly. */
export function getExteriorMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const visit = (object: THREE.Object3D) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry;
      if (
        (geometry instanceof THREE.CylinderGeometry &&
          Math.min(geometry.parameters.radiusTop, geometry.parameters.radiusBottom) >= 17) ||
        geometry instanceof THREE.RingGeometry ||
        geometry instanceof THREE.BoxGeometry ||
        geometry instanceof THREE.ExtrudeGeometry
      ) meshes.push(object);
    } else if (
      object.position.lengthSq() === 0 && object.rotation.x === 0 &&
      object.rotation.y === 0 && object.rotation.z === 0 &&
      object.scale.equals(new THREE.Vector3(1, 1, 1))
    ) object.children.forEach(visit);
  };
  root.children.forEach(visit);
  return meshes;
}

/**
 * B changes material assignment ONLY. Rear = triangle centroid in local -Z
 * (theta 90..270 degrees). Clone groups on spanning rings, never add a mesh.
 * Positions, indices, normals, UVs, winding, drawRange and transforms are kept.
 * The +/-90 degree seam can differ by at most one existing triangle.
 * A/C restore exact original references; shared resources are never mutated.
 */
export function applyRearNeutral(root: THREE.Object3D): () => void {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const restore: Array<() => void> = [];
  for (const mesh of getExteriorMeshes(root)) {
    if (Array.isArray(mesh.material)) throw new Error('Rear diagnostic expects single-material shell meshes.');
    const originalGeometry = mesh.geometry;
    const originalMaterial = mesh.material;
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
    const positions = originalGeometry.getAttribute('position');
    const index = originalGeometry.index;
    const count = index?.count ?? positions.count;
    const rear: boolean[] = [];
    const point = new THREE.Vector3();
    for (let i = 0; i < count; i += 3) {
      let z = 0;
      for (let j = 0; j < 3; j++) {
        point.fromBufferAttribute(positions, index ? index.getX(i + j) : i + j).applyMatrix4(matrix);
        z += point.z;
      }
      rear.push(z < -1e-6);
    }
    if (!rear.some(Boolean)) continue;
    const geometry = originalGeometry.clone();
    geometry.clearGroups();
    let start = 0;
    for (let triangle = 1; triangle <= rear.length; triangle++) {
      if (triangle === rear.length || rear[triangle] !== rear[start]) {
        geometry.addGroup(start * 3, (triangle - start) * 3, rear[start] ? 1 : 0);
        start = triangle;
      }
    }
    const neutral = new THREE.MeshBasicMaterial({
      color: '#b8b8b8', fog: false, toneMapped: false,
      side: originalMaterial.side,
      depthTest: originalMaterial.depthTest, depthWrite: originalMaterial.depthWrite,
      transparent: originalMaterial.transparent, opacity: originalMaterial.opacity,
    });
    mesh.geometry = geometry;
    mesh.material = [originalMaterial, neutral];
    restore.push(() => {
      mesh.geometry = originalGeometry;
      mesh.material = originalMaterial;
      geometry.dispose();
      neutral.dispose();
    });
  }
  return () => restore.forEach((undo) => undo());
}

/** Group-independent outer-shell signature; excludes animated portal props. */
export function surfaceSignature(root: THREE.Object3D): string {
  root.updateWorldMatrix(true, true);
  let hash = 2166136261;
  const add = (value: number) => {
    const text = String(value);
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  };
  for (const object of getExteriorMeshes(root)) {
    object.matrixWorld.elements.forEach(add);
    for (const name of Object.keys(object.geometry.attributes).sort()) {
      const attribute = object.geometry.getAttribute(name);
      add(attribute.count); add(attribute.itemSize);
      for (let i = 0; i < attribute.count; i++) {
        for (let j = 0; j < attribute.itemSize; j++) add(attribute.getComponent(i, j));
      }
    }
    const index = object.geometry.index;
    if (index) for (let i = 0; i < index.count; i++) add(index.getX(i));
    add(object.geometry.drawRange.start); add(object.geometry.drawRange.count);
  }
  return (hash >>> 0).toString(16);
}

/** Actual generated outer-shell hits, not inferred arc coverage or GPU proof. */
export function probeRear(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const meshes = getExteriorMeshes(root);
  return [148, 164, 180, 196, 212].map((theta) => ({
    theta,
    bands: [1.5, 4, 7.6, 9, 12, 16.2].map((y) => {
      const angle = THREE.MathUtils.degToRad(theta);
      const origin = root.localToWorld(new THREE.Vector3(25 * Math.sin(angle), y, 25 * Math.cos(angle)));
      const direction = new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle)).transformDirection(root.matrixWorld);
      const hit = new THREE.Raycaster(origin, direction, 0, 9).intersectObjects(meshes, false)[0];
      const radius = hit?.object instanceof THREE.Mesh && hit.object.geometry instanceof THREE.CylinderGeometry
        ? hit.object.geometry.parameters.radiusTop : undefined;
      return { y, surface: !hit ? 'opening' : radius === 17 ? 'recess liner' : 'stone' };
    }),
  }));
}
