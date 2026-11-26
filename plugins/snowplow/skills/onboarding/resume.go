package main

import (
	"bufio"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Contract v1: SKILL.md's stage table is the only stage list; the progress
// file is the only state. New stages or tool files are picked up from disk.
type call struct {
	Tool   string `json:"tool"`
	Skill  string `json:"skill"`
	Stage  string `json:"stage"`
	Status string `json:"status"`
	Path   string `json:"path"`
	Note   string `json:"note"`
}

func refs(skill string) map[string]string {
	out := map[string]string{}
	f, err := os.Open(skill)
	if err != nil {
		return out
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		c := strings.Split(s.Text(), "|")
		if len(c) < 6 {
			continue
		}
		id := strings.TrimSpace(c[1])
		if id == "" || id == "#" || strings.HasPrefix(id, "-") {
			continue
		}
		ref := strings.Trim(strings.TrimSpace(c[4]), "` ")
		if strings.HasPrefix(ref, "references/") || strings.HasPrefix(ref, "tools/") {
			out[id] = ref
		}
	}
	return out
}

func findProgress() string {
	found := ""
	filepath.WalkDir(".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || found != "" {
			return nil
		}
		if d.IsDir() {
			if d.Name() == ".git" || d.Name() == "node_modules" {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Name() == "snowplow-onboarding.md" {
			found = p
		}
		return nil
	})
	return found
}

func main() {
	_, src, _, ok := runtime.Caller(0)
	dir := "."
	if ok {
		dir = filepath.Dir(src)
	}
	ref := refs(filepath.Join(dir, "SKILL.md"))
	c := call{Skill: dir}
	p := findProgress()
	if p == "" {
		c.Stage = "1"
	} else if f, err := os.Open(p); err == nil {
		defer f.Close()
		s := bufio.NewScanner(f)
		for s.Scan() {
			cells := strings.Split(s.Text(), "|")
			if len(cells) < 4 {
				continue
			}
			name := strings.TrimSpace(cells[1])
			if name == "Stage" || strings.HasPrefix(name, "---") || name == "" {
				continue
			}
			status := strings.TrimSpace(cells[2])
			if status == "done" || status == "skipped" {
				continue
			}
			c.Stage = strings.Fields(name)[0]
			c.Status = status
			c.Note = strings.TrimSpace(cells[3])
			break
		}
	}
	c.Path = ref[c.Stage]
	base := dir
	if strings.HasPrefix(c.Path, "tools/") {
		c.Tool = strings.TrimSuffix(filepath.Base(c.Path), filepath.Ext(c.Path))
		base = filepath.Dir(filepath.Dir(dir)) // tool modules live at the plugin root
	} else if c.Path != "" {
		c.Tool = "none"
		c.Note = "no MCP tool for stage " + c.Stage + "; read " + c.Path
	} else {
		c.Tool = "none"
		c.Note = "no reference for stage " + c.Stage + "; read SKILL.md"
	}
	if c.Tool != "none" {
		if _, err := os.Stat(filepath.Join(base, c.Path)); err != nil {
			c.Tool, c.Path = "none", ""
			c.Note = "missing tool file for stage " + c.Stage + "; read SKILL.md"
		}
	}
	if p == "" {
		c.Note = "no progress file yet"
	}
	json.NewEncoder(os.Stdout).Encode(c)
}
