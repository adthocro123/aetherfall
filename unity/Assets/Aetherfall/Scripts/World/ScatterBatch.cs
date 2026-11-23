using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Aetherfall.World
{
    /// <summary>
    /// Draws hundreds of small scatter models (grass tufts, flowers) as a few combined meshes, one per grid cell, so an
    /// island's 900 to 1500 tufts cost a handful of draw calls and cull by cell. Only the instance list is saved with the
    /// scene: the meshes are built in memory when the component is enabled, with each instance's tint multiplied into its
    /// vertex colours (the web game tinted these instances). The source meshes must be readable in players.
    /// </summary>
    [ExecuteAlways, DisallowMultipleComponent]
    public class ScatterBatch : MonoBehaviour
    {
        [Serializable]
        public struct Part
        {
            public Mesh mesh;
            public Material[] materials;
            [Tooltip("The part's transform relative to the model root.")]
            public Matrix4x4 matrix;
        }

        [Serializable]
        public struct Instance
        {
            [Tooltip("Position relative to this object.")]
            public Vector3 position;
            [Tooltip("Degrees about +Y.")]
            public float yaw;
            public float scale;
            [Tooltip("Linear RGB multipliers for the vertex colours.")]
            public Vector3 tint;
        }

        public List<Part> parts = new List<Part>();
        public List<Instance> instances = new List<Instance>();
        [Min(1f)] public float cellSize = 16f;
        public ShadowCastingMode castShadows = ShadowCastingMode.Off;

        readonly List<GameObject> cells = new List<GameObject>();
        readonly List<Mesh> meshes = new List<Mesh>();

        public int CellCount => cells.Count;
        public int VertexCount { get; private set; }

        void OnEnable() => Rebuild();
        void OnDisable() => Clear();

        public void Rebuild()
        {
            Clear();
            if (parts == null || parts.Count == 0 || instances == null || instances.Count == 0) return;

            var byCell = new Dictionary<Vector2Int, List<int>>();
            for (int i = 0; i < instances.Count; i++)
            {
                Vector3 p = instances[i].position;
                var key = new Vector2Int(Mathf.FloorToInt(p.x / cellSize), Mathf.FloorToInt(p.z / cellSize));
                if (!byCell.TryGetValue(key, out var list)) byCell[key] = list = new List<int>();
                list.Add(i);
            }

            var sources = new Dictionary<Mesh, Source>();
            foreach (var kv in byCell)
            {
                var builders = new Dictionary<Material, Builder>();
                foreach (int i in kv.Value)
                {
                    Instance inst = instances[i];
                    float s = inst.scale <= 0f ? 1f : inst.scale;
                    Matrix4x4 m = Matrix4x4.TRS(inst.position, Quaternion.Euler(0f, inst.yaw, 0f), new Vector3(s, s, s));
                    Vector3 tint = inst.tint == Vector3.zero ? Vector3.one : inst.tint;
                    foreach (Part part in parts)
                    {
                        if (part.mesh == null || part.materials == null || part.materials.Length == 0) continue;
                        if (!sources.TryGetValue(part.mesh, out var src)) sources[part.mesh] = src = new Source(part.mesh);
                        if (!src.ok) continue;
                        for (int sub = 0; sub < src.indices.Length; sub++)
                        {
                            Material mat = part.materials[Mathf.Min(sub, part.materials.Length - 1)];
                            if (mat == null) continue;
                            if (!builders.TryGetValue(mat, out var b)) builders[mat] = b = new Builder();
                            b.Append(src, sub, m * part.matrix, tint);
                        }
                    }
                }
                foreach (var b in builders)
                    AddCell($"{name} {kv.Key.x},{kv.Key.y}", b.Value.ToMesh($"{name} {kv.Key.x},{kv.Key.y}"), b.Key);
            }
        }

        void AddCell(string cellName, Mesh mesh, Material mat)
        {
            mesh.hideFlags = HideFlags.HideAndDontSave;
            meshes.Add(mesh);
            VertexCount += mesh.vertexCount;
            var go = new GameObject(cellName) { hideFlags = HideFlags.HideAndDontSave, layer = gameObject.layer };
            go.transform.SetParent(transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = castShadows;
            mr.receiveShadows = true;
            mr.lightProbeUsage = LightProbeUsage.Off;
            mr.reflectionProbeUsage = ReflectionProbeUsage.Off;
            cells.Add(go);
        }

        void Clear()
        {
            foreach (var go in cells)
                if (go) DestroyImmediate(go);
            foreach (var mesh in meshes)
                if (mesh) DestroyImmediate(mesh);
            cells.Clear();
            meshes.Clear();
            VertexCount = 0;
        }

        /// <summary>A source mesh's data, read once per rebuild.</summary>
        sealed class Source
        {
            public readonly bool ok;
            public readonly Vector3[] vertices, normals;
            public readonly Color[] colors;
            public readonly int[][] indices;

            public Source(Mesh mesh)
            {
                if (!mesh.isReadable)
                {
                    Debug.LogWarning($"ScatterBatch: mesh '{mesh.name}' is not readable, so it can't be batched in a player.", mesh);
                    return;
                }
                vertices = mesh.vertices;
                normals = mesh.normals;
                colors = mesh.colors;
                indices = new int[mesh.subMeshCount][];
                for (int s = 0; s < mesh.subMeshCount; s++) indices[s] = mesh.GetTriangles(s);
                ok = vertices.Length > 0;
            }
        }

        sealed class Builder
        {
            readonly List<Vector3> v = new List<Vector3>();
            readonly List<Vector3> n = new List<Vector3>();
            readonly List<Color32> c = new List<Color32>();
            readonly List<int> t = new List<int>();
            readonly Dictionary<int, int> remap = new Dictionary<int, int>();

            public void Append(Source src, int sub, Matrix4x4 m, Vector3 tint)
            {
                bool hasN = src.normals != null && src.normals.Length == src.vertices.Length;
                bool hasC = src.colors != null && src.colors.Length == src.vertices.Length;
                remap.Clear();
                foreach (int i in src.indices[sub])
                {
                    if (!remap.TryGetValue(i, out int j))
                    {
                        j = v.Count;
                        remap[i] = j;
                        v.Add(m.MultiplyPoint3x4(src.vertices[i]));
                        n.Add(hasN ? m.MultiplyVector(src.normals[i]).normalized : Vector3.up);
                        Color col = hasC ? src.colors[i] : Color.white;
                        // Vertex colours are sRGB; the tint multiplies in linear space, as the web game's instance colours did.
                        col.r = Mathf.LinearToGammaSpace(Mathf.GammaToLinearSpace(col.r) * tint.x);
                        col.g = Mathf.LinearToGammaSpace(Mathf.GammaToLinearSpace(col.g) * tint.y);
                        col.b = Mathf.LinearToGammaSpace(Mathf.GammaToLinearSpace(col.b) * tint.z);
                        c.Add(col);
                    }
                    t.Add(j);
                }
            }

            public Mesh ToMesh(string meshName)
            {
                var mesh = new Mesh { name = meshName };
                if (v.Count > 65535) mesh.indexFormat = IndexFormat.UInt32;
                mesh.SetVertices(v);
                mesh.SetNormals(n);
                mesh.SetColors(c);
                mesh.SetTriangles(t, 0, true);
                return mesh;
            }
        }
    }
}
