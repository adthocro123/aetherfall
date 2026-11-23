using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace Aetherfall.EditorTools
{
    /// <summary>
    /// art/export/meta/&lt;Name&gt;.json: the import notes the Blender pipeline writes next to each FBX. Positions are already
    /// in Unity space, in the model root's space at the bind pose.
    /// </summary>
    public sealed class ArtMeta
    {
        public sealed class Clip
        {
            public string name, take, note;
            public float seconds;
            public bool loop;
        }

        public sealed class Socket
        {
            public string name, bone;
            public Vector3 position;
        }

        public sealed class HitSphere
        {
            public string bone, when;
            public Vector3 center;
            public float radius, damageMult;
        }

        public sealed class Circle
        {
            public Vector3 center;
            public float radius;
        }

        public string name, kind, group, notes;
        public int triangles;
        /// <summary>Generic, Humanoid or None.</summary>
        public string rig = "None";
        public readonly List<Clip> clips = new List<Clip>();
        public readonly List<Socket> sockets = new List<Socket>();
        public readonly List<HitSphere> hitSpheres = new List<HitSphere>();
        /// <summary>Movement blockers, as the web game used them: circles in the ground plane (collider / colliders).</summary>
        public readonly List<Circle> blockers = new List<Circle>();
        public float blockerHeight;

        public bool IsHumanoid => rig == "Humanoid";
        public bool IsGeneric => rig == "Generic";

        public Clip ClipForTake(string take)
        {
            foreach (var c in clips) if (c.take == take) return c;
            return null;
        }

        public Clip ClipNamed(string clipName)
        {
            foreach (var c in clips) if (c.name == clipName) return c;
            return null;
        }

        /// <summary>Reads meta JSON for a model. Returns null if the file is missing.</summary>
        public static ArtMeta Load(string path)
        {
            if (!File.Exists(path)) return null;
            var d = J.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var m = new ArtMeta
            {
                name = J.Str(d, "name"),
                kind = J.Str(d, "kind"),
                group = J.Str(d, "group"),
                notes = J.Str(d, "notes"),
                triangles = (int)J.Num(d, "triangles"),
            };
            if (J.Get(d, "unity") is Dictionary<string, object> u) m.rig = J.Str(u, "rig", "None");

            if (J.Get(d, "clips") is List<object> clips)
                foreach (var o in clips)
                {
                    var c = J.Obj(o);
                    m.clips.Add(new Clip
                    {
                        name = J.Str(c, "name"), take = J.Str(c, "take"), note = J.Str(c, "note"),
                        seconds = J.Num(c, "seconds"), loop = J.Bool(c, "loop"),
                    });
                }

            if (J.Get(d, "sockets") is Dictionary<string, object> sockets)
                foreach (var kv in sockets)
                {
                    var s = J.Obj(kv.Value);
                    m.sockets.Add(new Socket { name = kv.Key, bone = J.Get(s, "bone") as string, position = J.Vec3(s["position"]) });
                }

            if (J.Get(d, "hitSpheres") is List<object> hits)
                foreach (var o in hits)
                {
                    var h = J.Obj(o);
                    m.hitSpheres.Add(new HitSphere
                    {
                        bone = J.Str(h, "bone"), when = J.Str(h, "when", "always"), center = J.Vec3(h["center"]),
                        radius = J.Num(h, "radius"), damageMult = J.Num(h, "damageMult", 1f),
                    });
                }

            if (J.Get(d, "collider") is Dictionary<string, object> col)
            {
                m.blockers.Add(new Circle { center = Vector3.zero, radius = J.Num(col, "radius") });
                m.blockerHeight = J.Num(col, "height");
            }
            if (J.Get(d, "colliders") is List<object> cols)
                foreach (var o in cols)
                {
                    var c = J.Obj(o);
                    m.blockers.Add(new Circle { center = J.Has(c, "center") ? J.Vec3(c["center"]) : Vector3.zero, radius = J.Num(c, "radius") });
                }
            return m;
        }
    }
}
