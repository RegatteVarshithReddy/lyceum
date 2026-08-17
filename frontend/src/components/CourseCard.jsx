import React from "react";
import { Link } from "react-router-dom";
import { posterColors, initials } from "../utils.js";

export default function CourseCard({ course }) {
  const pct = course.video_count > 0 ? Math.round((course.completed_count / course.video_count) * 100) : 0;

  return (
    <Link className="course-card" to={`/courses/${course.id}`}>
      {course.cover_thumbnail ? (
        <img className="course-poster" src={`/api/thumbnails/${course.cover_thumbnail}`} alt="" />
      ) : (
        <div className="course-poster-fallback" style={posterColors(course.title)}>
          {initials(course.title)}
        </div>
      )}
      <div className="course-card-body">
        <div className="course-card-title">{course.title}</div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="course-card-meta">
          {course.completed_count}/{course.video_count} watched
        </div>
      </div>
    </Link>
  );
}
