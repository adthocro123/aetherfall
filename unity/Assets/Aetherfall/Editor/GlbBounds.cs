using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;

namespace Aetherfall.EditorTools
{
    /// <summary>
    /// Reads the extents of a model's GLB export (art/export/glb, next to this project in the repository), converted to
    /// Unity space, so the import report can check each FBX came in facing the right way. glTF and the meta files share
    /// Blender's conversion, apart from the mirrored x.
    /// </summary>
    static class GlbBounds
    {
        public static string PathFor(string asset) => Path.GetFullPath(Path.Combine("..", "art", "export", "glb", asset + ".glb"));

        public static bool TryGet(string asset, out Bounds unityBounds)
        {
            unityBounds = default;
            string path = PathFor(asset);
            if (!File.Exists(path)) return false;
            byte[] data = File.ReadAllBytes(path);
            if (data.Length < 20 || BitConverter.ToUInt32(data, 0) != 0x46546C67) return false; // "glTF"
            var doc = J.Obj(MiniJson.Parse(Encoding.UTF8.GetString(data, 20, BitConverter.ToInt32(data, 12))));
            var nodes = J.Arr(doc["nodes"]);
            var meshes = J.Arr(doc["meshes"]);
            var accessors = J.Arr(doc["accessors"]);
            var scene = J.Obj(J.Arr(doc["scenes"])[(int)J.Num(doc, "scene", 0f)]);

            bool any = false;
            var b = new Bounds();
            void Walk(int index, Matrix4x4 parent)
            {
                var n = J.Obj(nodes[index]);
                Matrix4x4 m = parent * Local(n);
                if (J.Has(n, "mesh"))
                    foreach (object p in J.Arr(J.Obj(meshes[(int)J.Num(n, "mesh")])["primitives"]))
                    {
                        var attributes = J.Obj(J.Obj(p)["attributes"]);
                        if (!J.Has(attributes, "POSITION")) continue;
                        var a = J.Obj(accessors[(int)J.Num(attributes, "POSITION")]);
                        Vector3 lo = J.Vec3(a["min"]), hi = J.Vec3(a["max"]);
                        for (int c = 0; c < 8; c++)
                        {
                            Vector3 w = m.MultiplyPoint3x4(new Vector3((c & 1) == 0 ? lo.x : hi.x, (c & 2) == 0 ? lo.y : hi.y, (c & 4) == 0 ? lo.z : hi.z));
                            if (!any) { b = new Bounds(w, Vector3.zero); any = true; }
                            else b.Encapsulate(w);
                        }
                    }
                if (J.Get(n, "children") is List<object> children)
                    foreach (object c in children) Walk((int)J.Num(c), m);
            }
            foreach (object root in J.Arr(scene["nodes"])) Walk((int)J.Num(root), Matrix4x4.identity);
            if (!any) return false;
            unityBounds.SetMinMax(new Vector3(-b.max.x, b.min.y, b.min.z), new Vector3(-b.min.x, b.max.y, b.max.z));
            return true;
        }

        static Matrix4x4 Local(Dictionary<string, object> n)
        {
            if (J.Get(n, "matrix") is List<object> list)
            {
                float[] f = J.Floats(list);
                var m = new Matrix4x4();
                for (int c = 0; c < 4; c++)
                    for (int r = 0; r < 4; r++) m[r, c] = f[c * 4 + r];
                return m;
            }
            Vector3 t = J.Has(n, "translation") ? J.Vec3(n["translation"]) : Vector3.zero;
            Quaternion q = Quaternion.identity;
            if (J.Get(n, "rotation") is List<object> rot)
            {
                float[] f = J.Floats(rot);
                q = new Quaternion(f[0], f[1], f[2], f[3]);
            }
            Vector3 s = J.Has(n, "scale") ? J.Vec3(n["scale"]) : Vector3.one;
            return Matrix4x4.TRS(t, q, s);
        }
    }
}
