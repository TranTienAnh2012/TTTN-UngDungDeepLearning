package com.attendance.repository;

import com.attendance.model.ClassSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface ClassScheduleRepository extends JpaRepository<ClassSchedule, Long> {
    List<ClassSchedule> findAllByOrderByStartTimeDesc();

    @Query("SELECT s FROM ClassSchedule s WHERE :now BETWEEN s.startTime AND s.endTime")
    List<ClassSchedule> findCurrentSchedules(@Param("now") LocalDateTime now);
}
