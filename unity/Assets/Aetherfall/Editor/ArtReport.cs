using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Aetherfall.World;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools
{
    /// <summary>
    /// Aetherfall > Art Import Report: checks every imported model against its meta JSON (triangles, materials, rig and
    /// avatar, clip names, lengths and looping, sockets, hit spheres) and writes Logs/art-import-report.txt.
    /// </summary>
    public static class ArtReport
    {
        const string ReportPath = "Logs/art-import-report.txt";

        [MenuItem("Aetherfall/Art Import Report", priority = 21)]
        static void RunMenu()
        {
            string text = Build(out int problems);
            Debug.Log(text);
            if (problems > 0) EditorUtility.DisplayDialog("Art Import Report", $"{problems} problem(s); see {ReportPath}.", "OK");
        }

        /// <summary>Unity -batchmode -projectPath unity -executeMethod Aetherfall.EditorTools.ArtReport.RunFromCommandLine</summary>
        public static void RunFromCommandLine()
        {
            int code = 0;
            try
            {
                Debug.Log(Build(out int problems));
                if (problems > 0) code = 3;
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                code = 1;
            }
            EditorApplication.Exit(code);
        }

        public static string Build(out int problems)
        {
            problems = 0;
            var sb = new StringBuilder();
            var files = Directory.GetFiles(Paths.Fbx, "*.fbx").Select(p => p.Replace('\\', '/')).OrderBy(p => p).ToList();
            sb.AppendLine($"[Aetherfall] Art import report: {files.Count} models");
            foreach (string path in files)
            {
                string name = Path.GetFileNameWithoutExtension(path);
                var issues = new List<string>();
                var go = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                var importer = AssetImporter.GetAtPath(path) as ModelImporter;
                ArtMeta meta = ArtMeta.Load(Paths.MetaPath(name));
                if (go == null || importer == null)
                {
                    sb.AppendLine($"  {name}: DID NOT IMPORT");
                    problems++;
                    continue;
                }
                if (meta == null) issues.Add("no meta JSON");

                // Meshes, triangles, materials and bounds in the model root's space.
                int tris = 0;
                var mats = new SortedSet<string>();
                var bounds = new Bounds();
                bool any = false;
                Matrix4x4 toRoot = go.transform.worldToLocalMatrix;
                // Every mesh, including collider-only ones without a renderer (EdgeWall); skinned meshes at their bind pose.
                var parts = new List<(Mesh mesh, Transform t, Renderer r)>();
                foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>(true))
                    if (smr.sharedMesh != null) parts.Add((smr.sharedMesh, smr.transform, smr));
                foreach (var mf in go.GetComponentsInChildren<MeshFilter>(true))
                    if (mf.sharedMesh != null) parts.Add((mf.sharedMesh, mf.transform, mf.TryGetComponent(out Renderer mr) ? mr : null));
                foreach (var (mesh, t, r) in parts)
                {
                    for (int s = 0; s < mesh.subMeshCount; s++) tris += (int)mesh.GetIndexCount(s) / 3;
                    if (r != null) foreach (var m in r.sharedMaterials) mats.Add(m != null ? m.name : "(none)");
                    if (mesh.colors32.Length == 0) issues.Add($"{mesh.name} has no vertex colours");
                    Matrix4x4 m2r = toRoot * t.localToWorldMatrix;
                    foreach (Vector3 v in mesh.vertices)
                    {
                        Vector3 c = m2r.MultiplyPoint3x4(v);
                        if (!any) { bounds = new Bounds(c, Vector3.zero); any = true; }
                        else bounds.Encapsulate(c);
                    }
                }
                if (meta != null && meta.triangles > 0 && tris != meta.triangles) issues.Add($"{tris} triangles, meta says {meta.triangles}");
                foreach (string m in mats)
                    if (m != "M_VertexColor" && m != "M_Glow") issues.Add($"material '{m}' was not remapped");
                if (go.transform.localRotation != Quaternion.identity) issues.Add($"root rotation {go.transform.localRotation.eulerAngles}");

                // Orientation: the model's extents must match its GLB export (same Blender data, x mirrored).
                string facing = "";
                if (GlbBounds.TryGet(name, out Bounds glb))
                {
                    float tol = Mathf.Max(0.02f, 0.01f * glb.size.magnitude);
                    bool match = (bounds.min - glb.min).magnitude < tol && (bounds.max - glb.max).magnitude < tol;
                    facing = match ? ", matches GLB" : "";
                    if (!match) issues.Add($"extents {bounds.min:F2}..{bounds.max:F2} don't match the GLB's {glb.min:F2}..{glb.max:F2} (turned or flipped?)");
                }

                // Rig and clips.
                var animator = go.GetComponent<Animator>();
                string rig = importer.animationType.ToString();
                if (meta != null)
                {
                    string want = meta.IsHumanoid ? "Human" : meta.IsGeneric ? "Generic" : "None";
                    if (rig != want) issues.Add($"rig {rig}, meta wants {want}");
                }
                string avatar = "";
                if (animator != null)
                {
                    if (animator.applyRootMotion) issues.Add("Apply Root Motion is on");
                    if (animator.avatar == null) avatar = ", no avatar";
                    else if (!animator.avatar.isValid) { avatar = ", INVALID avatar"; issues.Add("invalid avatar"); }
                    else avatar = animator.avatar.isHuman ? ", humanoid avatar" : ", generic avatar";
                    if (meta != null && meta.IsHumanoid && (animator.avatar == null || !animator.avatar.isHuman)) issues.Add("not a humanoid avatar");
                }
                var clips = AssetDatabase.LoadAllAssetRepresentationsAtPath(path).OfType<AnimationClip>().ToList();
                var clipText = new List<string>();
                if (meta != null)
                    foreach (var mc in meta.clips)
                    {
                        AnimationClip clip = clips.FirstOrDefault(c => c.name == mc.name);
                        if (clip == null) { issues.Add($"clip {mc.name} missing"); continue; }
                        bool loop = AnimationUtility.GetAnimationClipSettings(clip).loopTime;
                        if (loop != mc.loop) issues.Add($"clip {mc.name} loop {loop}, meta says {mc.loop}");
                        if (Mathf.Abs(clip.length - mc.seconds) > 1.5f / 30f) issues.Add($"clip {mc.name} is {clip.length:0.###} s, meta says {mc.seconds:0.###} s");
                        clipText.Add($"{mc.name} {clip.length:0.##}s{(loop ? " loop" : "")}");
                    }
                foreach (var c in clips)
                    if (meta == null || meta.ClipNamed(c.name) == null) issues.Add($"extra clip '{c.name}'");

                // Sockets and hit spheres, compared in the model root's space.
                var sockets = go.GetComponent<ModelSockets>();
                var socketText = new List<string>();
                if (meta != null)
                    foreach (var s in meta.sockets)
                    {
                        Transform t = sockets != null ? sockets.Get(s.name) : null;
                        if (t == null) { issues.Add($"socket {s.name} missing"); continue; }
                        Vector3 p = go.transform.InverseTransformPoint(t.position);
                        if ((p - s.position).magnitude > 0.02f) issues.Add($"socket {s.name} at {p}, meta says {s.position}");
                        socketText.Add($"{s.name} on {(t.parent != null ? t.parent.name : "root")}");
                    }
                var zones = go.GetComponentsInChildren<HitZone>(true);
                if (meta != null)
                {
                    if (zones.Length != meta.hitSpheres.Count) issues.Add($"{zones.Length} hit spheres, meta has {meta.hitSpheres.Count}");
                    // Named the way ArtPostprocessor names them: Hit_<bone>, then Hit_<bone>_2 and so on.
                    var seen = new HashSet<string>();
                    foreach (var h in meta.hitSpheres)
                    {
                        string zoneName = "Hit_" + h.bone;
                        for (int k = 2; !seen.Add(zoneName); k++) zoneName = $"Hit_{h.bone}_{k}";
                        HitZone zone = zones.FirstOrDefault(z => z.name == zoneName);
                        if (zone == null) { issues.Add($"hit sphere {zoneName} missing"); continue; }
                        Vector3 p = go.transform.InverseTransformPoint(zone.transform.position);
                        if ((p - h.center).magnitude > 0.02f) issues.Add($"hit sphere {zoneName} at {p}, meta says {h.center}");
                        if (zone.transform.parent == null || zone.transform.parent.name != h.bone) issues.Add($"hit sphere {zoneName} is not on bone {h.bone}");
                    }
                }

                problems += issues.Count;
                sb.Append($"  {name}: {tris} tris, {string.Join("+", mats)}, rig {rig}{avatar}, " +
                          $"size {bounds.size.x:0.##} x {bounds.size.y:0.##} x {bounds.size.z:0.##}{facing}");
                if (clipText.Count > 0) sb.Append($"; clips: {string.Join(", ", clipText)}");
                if (socketText.Count > 0) sb.Append($"; sockets: {string.Join(", ", socketText)}");
                if (zones.Length > 0) sb.Append($"; {zones.Length} hit spheres");
                sb.AppendLine(issues.Count == 0 ? "  OK" : "");
                foreach (string issue in issues) sb.AppendLine("      PROBLEM: " + issue);
            }
            sb.AppendLine(problems == 0 ? "  all models OK" : $"  {problems} problem(s)");
            Directory.CreateDirectory(Path.GetDirectoryName(ReportPath));
            File.WriteAllText(ReportPath, sb.ToString());
            return sb.ToString();
        }
    }
}
